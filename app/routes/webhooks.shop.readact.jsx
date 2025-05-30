import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Delete all data associated with the shop
    await db.ageVerificationSettings.deleteMany({
      where: { shop },
    });

    await db.ageVerificationRules.deleteMany({
      where: { shop },
    });

    await db.account.deleteMany({
      where: { shop },
    });

    // Delete sessions associated with the shop
    await db.session.deleteMany({
      where: { shop },
    });

    console.log(`Successfully redacted all data for shop: ${shop}`);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`Error processing shop redaction for shop ${shop}:`, error);
    return new Response(null, { status: 500 });
  }
};