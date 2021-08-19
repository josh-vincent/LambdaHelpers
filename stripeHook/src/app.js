/*
Copyright 2017 - 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
    http://aws.amazon.com/apache2.0/
or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.
*/

const AWS = require("aws-sdk", { region: process.env.REGION });
var awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');

// Stripe parameters
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET

var express = require('express')
var bodyParser = require('body-parser')

const cognito = new AWS.CognitoIdentityServiceProvider({ apiVersion: "2016-04-18" });
const docClient = new AWS.DynamoDB.DocumentClient();

// Store TABLE name in ENV variable
// @key(name: "profileByStripeId", fields: ["stripe_id"], queryField: "profileByStripeId")
// Has at least these 2 fields, and GSI profileByStripeId ['stripe_id'] {subscription_tier: String, updatedAt: String, stripe_id: String}

const TABLE_NAME = `${process.env.TABLE_NAME}-${process.env.ENV}`

// declare a new express app
var app = express()
//app.use(bodyParser.json())
// Add raw body to req params for Stripe signature check
app.use(
  bodyParser.json({
    verify: function (req, res, buf)
    {
      req.rawBody = buf.toString()
    },
  })
)
app.use(awsServerlessExpressMiddleware.eventContext())

// Enable CORS for all methods
app.use(function (req, res, next)
{
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
});

app.post("/webhook", async function (req, res)
{
  // Check Stripe signature
  const sig = req.headers['stripe-signature']
  let event
  try
  {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret)
  } catch (err)
  {
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
  console.log(JSON.stringify(event))

  let product;
  let cognitoUserItem;

  switch (event.type)
  {

    case 'checkout.session.completed':

      if (req.body.data.object.mode == 'subscription')
      {
        console.log(`Payment checkout session for ${req.body.data.object.client_reference_id} was successful!`)
        console.log('response', req.body.data.object);
        const { cognito_user, subscription } = req.body.data.object.metadata
        // ? function gets users ID for cognito and update subscription type
        await updateItem({id: cognito_user, subscription: subscription, table:TABLE_NAME})
      } else if (req.body.data.object.mode == 'payment')
      {
        const cognito_user = req.body.data.object.client_reference_id
        console.log(`Payment checkout session for ${req.body.data.object.client_reference_id} was successful!`)
        console.log(`Paid $ ${req.body.data.object.amount_total / 100} `)
      }
      break

    case 'customer.subscription.updated':
      console.log(`Subscription UPDATED for ${req.body.data.object.customer}!`);

      console.log('-----GETTING PLAN DETAILS------');
      product = await getPlanFromStripe(req.body.data.object.plan.product);
      console.log("Product:", product)

      console.log('-----GETTING USER DETAILS------')
      cognitoUserItem = await queryItems(req.body.data.object.customer, TABLE_NAME);
      console.log("USER:", cognitoUserItem)

      if (cognitoUserItem && product)
      {
        await updateItem({ id: cognitoUserItem.Items[0].id, subscription: (product.name).toLowerCase(), table: TABLE_NAME });
        console.log("-----Updated Item------");
      }
      break;

    case 'customer.subscription.deleted':
      console.log(`Subscription DELETED for ${req.body.data.object.customer}!`);
      cognitoUserItem = await queryItems(req.body.data.object.customer, TABLE_NAME);
      await updateItem({ id: cognitoUserItem.Items[0].id,subscription: 'free', table: TABLE_NAME})
      console.log("RESETTING PROFILE BACK TO FREE", cognitoUserItem);
      break;

    case 'customer.subscription.created':
      console.log(`Subscription CREATED for ${req.body.data.object.customer}!`);

      console.log('-----GETTING PLAN DETAILS------')
      product = await getPlanFromStripe(req.body.data.object.plan.product);
      console.log("Product:", product)

      console.log('-----GETTING USER DETAILS------')
      cognitoUserItem = await queryItems(req.body.data.object.customer, TABLE_NAME);
      console.log("USER:", cognitoUserItem);

      if (cognitoUserItem && product)
      {
        await updateItem({ id: cognitoUserItem.Items[0].id, subscription: (product.name).toLowerCase(), table: TABLE_NAME });
        console.log("-----Updated Item------")
      }

      break;

    default:
      // Unexpected event type
      return res.status(400).end()
  }
  // Return a response to acknowledge receipt of the event
  res.json({ received: true })
})

app.listen(3000, function ()
{
  console.log("App started")
});

// Export the app object. When executing the application local this does nothing. However,
// to port it to AWS Lambda we will create a wrapper around that will load the app from
// this file
module.exports = app

//Updating Item in Cognito, Make sure to add permissions to read/write to table.
const updateItem = async ({ id, subscription, table }) =>
{
  var inputParams = {
    TableName: table,
    Key: {
      id: id,
    },
    UpdateExpression: "SET #subtier = :subtier, #uA = :ua",
    ExpressionAttributeValues: {
      ":subtier": subscription,
      ":ua": new Date().toISOString(),
    },
    ExpressionAttributeNames: {
      "#subtier": "subscription_tier",
      "#uA": "updatedAt",
    },
  };
  const updated = await docClient
    .update(inputParams)
    .promise()
    .then((data) => console.log(data))
    .catch((err) => console.log(err));
  return updated
}

async function getUserByStripeId(stripeId, { table })
{
    let getParams = {
      TableName: table,
      Key: { stripe_id: stripeId },
    };
    let response = await docClient.get(getParams).promise();
    console.log("response", response);
    let user = response.Item;
  return user;
}

async function queryItems(checkThisId, table)
{
  var params = {
    TableName: table,
    IndexName: "profileByStripeId",
    KeyConditionExpression: "#stripeCustomer = :stripeCustomer",
    ExpressionAttributeNames: {
      "#stripeCustomer": "stripe_id"
    },
    ExpressionAttributeValues: {
      ":stripeCustomer": checkThisId
    }
  };
  try
  {
    const data = await docClient.query(params).promise();
    return data;
  }
  catch (err) { return err; }
}

async function getUserByEmailFromCognito(filter, value, userPoolId)
{
  const listUsersResponse = await cognito.listUsers({
    UserPoolId: userPoolId,
    Filter: `${filter} = "${value}"`,
    Limit: 1
  }).promise();
  const user = listUsersResponse.Users[0];
  console.log(user);
  return user;
}

async function getPlanFromStripe(productId)
{
  const product = await stripe.products.retrieve(
    productId
  );

  return product
}
