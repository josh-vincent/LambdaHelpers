/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.REGION });
const docClient = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider({ apiVersion: "2016-04-18" });

const stripe = require("stripe")(process.env.STRIPE_LIVE_KEY);
const stripeTest = require("stripe")(process.env.STRIPE_TEST_KEY);
const tableName = `${process.env.TABLE_NAME}-${process.env.ENV}`;

exports.handler = async (event, context, callback) =>
{
    const { userName, userPoolId } = event;
    const { request: { userAttributes } } = event;
    console.log(JSON.stringify(event));
    try
    {
        const stripeUser = await createUserInStripe(userAttributes);
        console.log(stripeUser);

        const value = { stripe_id: stripeUser.id };
        const updatedUser = await updateCognito(userPoolId, userName, value);

        const response = {
            statusCode: 200,
            body: JSON.stringify("Created Stripe User!"),
        };
        callback(null, event);
        return response;
    } catch (error)
    {
        console.error("error", error);
        const response = {
            statusCode: 500,
            body: JSON.stringify("Error adding Stripe User"),
        };
        return response;
    }
};

async function createUserInStripe(data)
{
    //console.log("adding to stripe:", data);
    const { username, email, sub } = data;
    const createdUser = await stripeTest.customers
        .create({
            name: username,
            email: email,
            description: sub,
        })
        .then((result) =>
        {
            console.log("result", result);
            return result;
        })
        .catch((err) => console.log("err", err));
    return createdUser;
}

const updateCognito = async (userPoolId, userName, value) =>
{
    // CustomAttribute in cognito custom:stripe_id
    const updatedUser = await cognito.adminUpdateUserAttributes({
        UserAttributes: [
            {
                Name: `custom:stripe_id`,
                Value: value.stripe_id,
            },
        ],
        UserPoolId: userPoolId,
        Username: userName,
    }).promise();
    return updatedUser;
};


const updateTable = async (userAttributes, stripeId) =>
{
    // {id: String, stripe_id: String, updatedAt: AWSDATETIME}
    const timestamp = new Date().toISOString();
    console.log("updating profile table:", userAttributes, stripeId);
    var inputParams = {
        TableName: tableName,
        Key: {
            id: userAttributes.sub,
        },
        UpdateExpression: "SET #stripe = :stripe, #uA = :ua",
        ExpressionAttributeValues: {
            ":stripe": stripeId,
            ":ua": timestamp,
        },
        ExpressionAttributeNames: {
            "#stripe": "stripe_id",
            "#uA": "updatedAt",
        },
    };

    let response = docClient.update(inputParams).promise();
    return response;
};
