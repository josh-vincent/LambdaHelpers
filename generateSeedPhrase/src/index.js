/* Amplify Params - DO NOT EDIT
	AUTH_FINANCEWEBAPP97F25861_USERPOOLID
	ENV
	REGION
Amplify Params - DO NOT EDIT */
const AWS = require("aws-sdk");
AWS.config.update({ region: "ap-southeast-2" });

const COGNITO = new AWS.CognitoIdentityServiceProvider({
    apiVersion: "2016-04-18",
});
const stripeTest = require("stripe")(
    "sk_test_ubDVscDUXB04y842N53sxWjh00advqWqiU"
);
const stripe = require("stripe")("sk_live_pGMoYL65V4KEDT0cT8uJESHV00bv0VCBip");
const docClient = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = "TokenWallet-6wiu2jqrbjclbjnypn6l3ta7kq-dev";
const uuid = require("uuid");
const bip39 = require("bip39");
const { hdkey, Wallet } = require("ethereumjs-wallet");

exports.handler = async (event, context, callback) =>
{
    const { userName, userPoolId } = event;
    const {
        request: { userAttributes },
    } = event;

    const createdMnemonic = await generateMnemonic();
    const publicAddress = await getPublicAddress(createdMnemonic)

    try
    {
        // no callback here
        const stripeUser = await createUserInStripe(userAttributes);
        console.log(stripeUser)

        const value = { stripe_id: stripeUser.id, createdMnemonic: createdMnemonic }
        const updatedUser = await updateCognito(userPoolId, userName, value)
        console.log(updatedUser)

        const createWallet = await createStartingWallet(userName, 1000, publicAddress, userAttributes.email);
        console.log(createWallet);

        const data = {
            senderId: "BBBID",
            senderPublicAddress: "0xBBB",
            senderEmail: "Barefoot Budgets Wallet",
            receiverId: userName,
            receiverEmail: userAttributes.email,
            amount: 1000,
            members: ["Barefoot Budgets Wallet", userName],
            receiverPublicAddress: publicAddress
        };
        const addTransaction = await addTokenTransaction(data);
        console.log(addTransaction);

        const response = {
            statusCode: 200,
            body: JSON.stringify("Seed Phrase added!"),
        };

        callback(null, event);
        return response;
    } catch (error)
    {
        console.error("error", error);
        const response = {
            statusCode: 500,
            body: JSON.stringify("Error adding Seed Phrase"),
        };
        return response;
    }
};

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

async function createStartingWallet(account, amount, public_address, email)
{
    console.log("updating balance:", account, amount);
    var inputParams = {
        TableName: TABLE_NAME,
        Key: {
            id: account,
        },
        UpdateExpression: "SET #ar = :ar, #em = :em, #ts = :t, #pk = :pk, #ua = :ua, #ca = :ca, #uid = :uid",
        ExpressionAttributeValues: {
            ":uid": account,
            ":em": email,
            ":t": amount,
            ":ar": amount,
            ":pk": public_address,
            ":ua": new Date().toISOString(),
            ":ca": new Date().toISOString()
        },
        ExpressionAttributeNames: {
            "#ts": "amount",
            "#uid": "userId",
            "#pk": "public_address",
            "#ua": "updatedAt",
            "#ca": "createdAt",
            "#em": "email",
            "#ar": "amountRaw"
        },
    };
    let response = docClient.update(inputParams).promise();
    return response;
}

async function addTokenTransaction(data)
{
    console.log("adding to transaction table balance:", data);
    const {
        amount, senderId, senderEmail, senderPublicAddress, members,
        receiverId, receiverEmail, receiverPublicAddress,
    } = data;
    const timestamp = new Date().toISOString();
    var inputParams = {
        TableName: "TokenTransaction-6wiu2jqrbjclbjnypn6l3ta7kq-dev",
        Key: {
            id: uuid.v4(),
        },
        UpdateExpression:
            `SET
                #members = :mbs,
                #am = :am,
                #amr = :amr,
                #suser = :suser,
                #saddress = :saddress,
                #sender = :sender,
                #ruser = :ruser,
                #raddress = :raddress,
                #receive = :rec,
                #ca = :ca
           `,
        ExpressionAttributeValues: {
            ":mbs": members,
            ":am": amount,
            ":amr": amount,
            ":saddress": senderPublicAddress,
            ":suser": senderEmail,
            ":sender": senderId,
            ":rec": receiverId,
            ":ruser": receiverEmail,
            ":raddress": receiverPublicAddress,
            ":ca": timestamp,
        },
        ExpressionAttributeNames: {
            "#members": "members",
            "#am": "amount",
            "#amr": "amountRaw",
            "#saddress": "sender_address",
            "#suser": "sender_username",
            "#sender": "sender",
            "#ruser": "receiver_username",
            "#raddress": "receiver_address",
            "#receive": "receipient",
            "#ca": "createdAt",
        },
    };

    let response = docClient.update(inputParams).promise();
    return response;
}

async function createUserInStripe(data)
{
    console.log("adding to stripe:", data);
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
    const updatedUser = await COGNITO.adminUpdateUserAttributes({
        UserAttributes: [
            {
                Name: `custom:seed_phrase`,
                Value: value.createdMnemonic,
            },
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
