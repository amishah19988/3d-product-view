import { json } from '@remix-run/node';
import prisma from '../db.server';

export const loader = async ({ request }) => {
  try {
    const miUrl = new URL(request.url);
    const miShop = miUrl.searchParams.get('shop');

    if (!miShop) {
      return json({ error: 'Shop parameter is missing' }, { status: 400 });
    }

    const settings = await prisma.threeDProductViewerSettings.findFirst({
      where: { shop: miShop },
    });

    if (!settings) {
      return json({ error: 'Settings not found for this shop' }, { status: 404 });
    }

    return json({
      status: settings.status,
      otherFeatures: settings.otherFeatures,
      width: settings.width,
      height: settings.height,
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching 3D viewer settings:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};