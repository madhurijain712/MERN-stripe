import React from "react";

import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.STRIPE_PUBLISHABLE_KEY);

export default function Stripe(props) {
  const options = {
    clientSecret: props.client_secret,
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      {props.children}
    </Elements>
  );
}
