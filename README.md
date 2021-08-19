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
