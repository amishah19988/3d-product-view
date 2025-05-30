import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Extract customer information from the payload
  const { customer } = payload;

  // Log the customer data request
  console.log(`Processing customer data request for customer ID: ${customer?.id}, shop: ${shop}`);

  try {
    // Retrieve relevant data associated with the shop
    const settings = await db.ageVerificationSettings.findFirst({
      where: { shop },
    });

    const rules = await db.ageVerificationRules.findFirst({
      where: { shop },
    });

    const account = await db.account.findFirst({
      where: { shop },
    });

    // Log the data (in a real app, you might send this to the shop owner or customer)
    console.log(`Data for shop ${shop}:`, {
      settings: settings || "No settings found",
      rules: rules || "No rules found",
      account: account || "No account found",
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`Error processing customer data request for shop ${shop}:`, error);
    return new Response(null, { status: 500 });
  }
};