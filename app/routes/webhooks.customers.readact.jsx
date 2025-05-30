import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Extract customer information from the payload
  const { customer } = payload;

  // Log the customer redaction request
  console.log(`Processing customer data redaction for customer ID: ${customer?.id}, shop: ${shop}`);

  try {
    // Delete any data associated with the shop that might include customer information
    await db.ageVerificationSettings.deleteMany({
      where: { shop },
    });

    await db.ageVerificationRules.deleteMany({
      where: { shop },
    });

    // Update account if it might include customer-related data
    await db.account.updateMany({
      where: { shop },
      data: { updatedat: new Date() },
    });

    console.log(`Successfully processed customer redaction for shop: ${shop}`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`Error processing customer redaction for shop ${shop}:`, error);
    return new Response(null, { status: 500 });
  }
};