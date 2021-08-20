# LambdaHelpers

## Stripe
`yarn add stripe`

```javascript
const AWS = require("aws-sdk");
AWS.config.update({ region: "ap-southeast-2" });

//* Store STRIPE KEYS as ENV Variables.
const stripe = require("stripe")(STRIPE_SECRET_KEY);
const stripeTest = require("stripe")(STRIPE_TEST_KEY);

exports.handler = async (event, context, callback) =>
{
    console.log(JSON.stringify(event));
    try
    {
        let collatedProducts = [];

        const products = await listProductsFromStripe();
        const prices = await listPricesFromStripe();

        // ? each item in products array map and find price per product.id and add to product object.
        products.data.map(product =>
        {
            let match = prices.data.filter(price => price.product === product.id)
            collatedProducts.push({ ...product, price: match})
        })

        const response = {
            statusCode: 200,
            body: JSON.stringify(collatedProducts),
        };

        callback(null, JSON.stringify(collatedProducts));
        return response;
    } catch (error)
    {
        console.error("error", error);
        const response = {
            statusCode: 500,
            body: JSON.stringify("Error getting products"),
        };
        return response;
    }
};
```

```javascript
async function getProductsFromStripe(productId)
{
    const product = await stripeTest.products.retrieve(
        productId
    );

    return product;
}
```

```javascript
async function listProductsFromStripe()
{
    const products = await stripeTest.products.list({active: true});
    return products;
}
```

```javascript
async function listPricesFromStripe()
{
    const prices = await stripeTest.prices.list({ active: true });
    return prices;
}
```
## Stripe Webhook

```javascript
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
       //Subscription completed ...
      } else if (req.body.data.object.mode == 'payment')
      {
        // Payment completed...
      }
      break

    case 'customer.subscription.updated':
      // Subscription updated ...
      break;

    case 'customer.subscription.deleted':
      // Subscription deleted
      break;

    case 'customer.subscription.created':
      // Subscription Created
      break;

    default:
      // Unexpected event type
      return res.status(400).end()
  }
  // Return a response to acknowledge receipt of the event
  res.json({ received: true })
})
```

```javascript
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
```

## Stripe Customer Portal

```
$ amplify add api
$ REST
$ API Gateway
```

```javascript
app.post('/create-customer-portal-session', async (req, res) =>
{
    let returnUrl = 'https://www.mywebsite.com/dashboard';
    // req = {body: stripe_id: cus_123456}
  try
  {
    const session = await stripe.billingPortal.sessions.create({
      customer: `${req.body.stripe_id}`,
      return_url: returnUrl,
    });
    res.json(session);
  } catch (err)
  {
    res.json(err);
  }
});
```


## Cognito

Assign correct permissions to update cognito with lambda role

```javascript
const AWS = require("aws-sdk");
const userPoolId = 'YOUR_USER_POOL_ID';
const cognito = new AWS.CognitoIdentityServiceProvider();

async function getUserByEmailFromCognito(email, userPoolId)
{
    const listUsersResponse = await cognito.listUsers({
        UserPoolId: userPoolId,
        Filter: `email = "${email}"`,
        Limit: 1
    }).promise();
    const user = listUsersResponse.Users[0];
    console.log(user);
    return user;
}
```

```javascript
// Value containing {stripe_id: cus_123456}
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

```

## Crypto

`npm install bip39 ethereumjs-wallet js-sha3`

```javascript
const bip39 = require("bip39");
const { hdkey, Wallet } = require("ethereumjs-wallet");

const createdMnemonic = await generateMnemonic();
const publicAddress = await getPublicAddress(createdMnemonic)

async function generateMnemonic()
{
    let mnemonic;
    let attempt = 0;
    do
    {
        attempt = attempt + 1;
        mnemonic = bip39.generateMnemonic();
        console.log(`${attempt} attempt trying menomic`, mnemonic);
    } while (bip39.validateMnemonic(mnemonic) === false);
    return mnemonic;
}

async function getPublicAddress(createdMnemonic)
{
    /*
       Ethereum derivePath m/44'/60'/0'/0
       Ledger derivePath m/44'/60'/0'
       To check addresses goto iancoleman.io/bip39, Change Derivation path to Bip32 and BIP32 path to m/44'/60'/0' same as above.
   */
    const seed = await bip39.mnemonicToSeed(createdMnemonic);
    const hdWallet = hdkey.fromMasterSeed(seed);
    const masterNode = hdWallet.derivePath("m/44'/60'/0'");
    const masterExtendedPublicKey = masterNode.publicExtendedKey();
    const myWallet = hdkey.fromExtendedKey(masterExtendedPublicKey);
    console.log("createdMnemonic:", createdMnemonic);
    let public_address;
    for (let i = 0; i < 1; i++)
    {
        //Change i for more public addresses
        const node = myWallet.derivePath("m/" + i);
        const nodeWallet = node.getWallet();
        public_address = nodeWallet.getAddressString();
        console.log("public_address:", public_address);
    }
    return public_address
}
```
