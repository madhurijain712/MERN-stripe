const express = require("express");
const cors = require("cors");

const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(cors());

// app.use('/webhook', express.json({ type: 'application/json' }))

app.post("/user/register", async (req, res) => {
  const { email, name, password, phone } = req.body;

  /*  Add this user in your database and store stripe's customer id against the user   */
  try {
    const customer = await createStripeCustomer({ email, name, password, phone });
    console.log(customer);
    res.status(200).json({ message: "Customer created" });
  } catch (err) {
    console.log(err);
    res.status(400).json({ message: "An error occured" });
  }
});

/* ---------------------------------------------------------------------- */

app.post("/payment/method/attach", async (req, res) => {
  const { paymentMethod } = req.body;

  /* Fetch the Customer Id of current logged in user from the database */
  const customerId = process.env.CUSTOMER_ID;
  try {
    const method = await attachMethod({ paymentMethod, customerId });
    const customer = await stripe.customers.update(
      customerId,
      {invoice_settings: {default_payment_method: paymentMethod.id}}
    );
    res.status(200).json({ message: "Payment method attached succesully" });
  } catch (err) {
    console.log(err);
    res.status(400).json({ message: "Could not attach method" });
  }
});

/* ---------------------------------------------------------------------- */

app.get("/payment/methods", async (req, res) => {
  /* Query database to fetch Stripe Customer Id of current logged in user */
  const customerId = process.env.CUSTOMER_ID;

  try {
    const paymentMethods = await listCustomerPayMethods(customerId);
    res.status(200).json(paymentMethods);
  } catch (err) {
    console.log(err);
    res.status(500).json("Could not get payment methods");
  }
});

/* ---------------------------------------------------------------------- */

app.post("/payment/create", async (req, res) => {
  const { paymentMethod } = req.body;

  /* Query database for getting the payment amount and customer id of the current logged in user */

  const amount = 1000;
  const currency = "INR";
  const userCustomerId = process.env.CUSTOMER_ID;
  const subscription = false
  let payment = {};
  try {
    if(!subscription) {
      payment = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: currency,
        customer: userCustomerId,
        payment_method: paymentMethod,
        // confirmation_method: "manual", // For 3D Security
        description: "Buy Product",
        payment_method_types: ['card'],
        payment_method_options: {
          card: {
            request_three_d_secure: 'any',
          },
        },
      });
    }
    else{
      payment = await stripe.subscriptions.create({
        customer: userCustomerId,
        coupon: 'test', // couponId
        items: [
          {
            price: process.env.ONETIME_PRICE_ID
          },
        ],
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        // default_payment_method: paymentIntent.payment_method,
      });
    }

    /* Add the payment intent record to your datbase if required */
    res.status(200).json(payment);
  } catch (err) {
    console.log(err);
    res.status(500).json("Could not create payment");
  }
});

/* ---------------------------------------------------------------------- */

app.post("/payment/confirm", async (req, res) => {
  const { paymentIntent, paymentMethod } = req.body;
  try {
    const intent = await stripe.paymentIntents.confirm(paymentIntent, {
      payment_method: paymentMethod,
    });

    /* Update the status of the payment to indicate confirmation */
    res.status(200).json(intent);
  } catch (err) {
    console.error(err);
    res.status(500).json("Could not confirm payment");
  }
});

/* ---------------------------------------------------------------------- */

app.post("/cancel/subscription", async (req, res) => {
  const subscriptionId = process.env.SUBSCRIPTION_ID
  try {
    const deleted = stripe.subscriptions.del(subscriptionId);
    /* return cancelled subscription */
    res.status(200).json(deleted);
  } catch (err) {
    console.error(err);
    res.status(500).json("Could not confirm payment");
  }
});
/* ---------------------------------------------------------------------- */

app.post("/update/subscription", async (req, res) => {
  const subscriptionId = process.env.SUBSCRIPTION_ID
  try {
    const subscription = await stripe.subscriptions.update(
      subscriptionId,
      { items: [
        { 
          id:"process.env.SUBSCRIPTION_ID",
          price: process.env.SUBSCRIPTION_PRICE_ID
        },
      ],
      proration_behavior:'always_invoice'
    }
    );
    /* return updated subscription */
    res.status(200).json(subscription);
  } catch (err) {
    console.error(err);
    res.status(500).json("Could not confirm payment");
  }
});

/* ---------------------------------------------------------------------- */

app.post("/list/invoices", async (req, res) => {
  const { customerId } = req.body;
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId
    });
    /* return list of customer */
    res.status(200).json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json("Could not confirm payment");
  }
});

/* ---------------------------------------------------------------------- */

app.post('/webhook', express.json({type: 'application/json'}), (request, response) => {
  const event = request.body;

  // Handle the event
  switch (event.type) {
    case 'invoice.finalized':
            console.log('invoice.finalized')
            break
          case 'invoice.paid':
            console.log('invoice.paid')
            break
          case 'invoice.finalization_failed': 
            console.log('invoice.finalization_failed')
            break
          case 'invoice.created':
            console.log('invoice.created')
            break
          case 'invoice.payment_action_required':
            console.log('invoice.payment_action_required')
            break
          case 'invoice.payment_failed':
            console.log('invoice.payment_failed')
            break
          case 'invoice.upcoming':
            console.log('invoice.upcoming')
            break
          case 'invoice.updated':
            console.log('invoice.updated')
            break
          default:
            console.log('none')
  }

  // Return a response to acknowledge receipt of the event
  response.json({received: true});
});

/* ---------------------------------------------------------------------- */

/* Helper Functions  ----------------------------------------------------------------------------------------------------- */

async function createStripeCustomer({ name, email, phone }) {
  return new Promise(async (resolve, reject) => {
    try {
      const Customer = await stripe.customers.create({
        name: name,
        email: email,
        phone: phone,
      });

      resolve(Customer);
    } catch (err) {
      console.log(err);
      reject(err);
    }
  });
}

async function listCustomerPayMethods(customerId) {
  return new Promise(async (resolve, reject) => {
    try {
      const paymentMethods = await stripe.customers.listPaymentMethods(customerId, {
        type: "card",
      });
      resolve(paymentMethods);
    } catch (err) {
      reject(err);
    }
  });
}

function attachMethod({ paymentMethod, customerId }) {
  return new Promise(async (resolve, reject) => {
    try {
      const paymentMethodAttach = await stripe.paymentMethods.attach(paymentMethod.id, {
        customer: customerId,
      });
      resolve(paymentMethodAttach);
    } catch (err) {
      console.log(55,err)
      reject(err);
    }
  });
}

function createWebhook(rawBody, sig) {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  )
  return event
}

/* -------------------------------------------------------------- */

app.listen(5000, (err) => {
  if (err) throw err;

  console.log("Server running");
});
