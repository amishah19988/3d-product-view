import { json } from '@remix-run/node';
import prisma from '../db.server';

export const loader = async ({ request }) => {
  try {
    const miUrl = new URL(request.url);
    const miShop = miUrl.searchParams.get('shop');
    const miProductId = miUrl.searchParams.get('productId');

    if (!miShop || !miProductId) {
      return json({ error: 'Shop and productId parameters are required' }, { status: 400 });
    }

    const threeDModel = await prisma.threeDProductViewerModel.findUnique({
      where: {
        productId_shop: {
          productId: miProductId,
          shop: miShop
        }
      }
    });

    const settings = await prisma.threeDProductViewerSettings.findFirst({
      where: { shop: miShop }
    });

    if (!threeDModel || !settings) {
      return json({ error: '3D model or settings not found for this shop/product' }, { status: 404 });
    }

    return json({
      model: {
        zipFile: threeDModel.zipFile,
        name: threeDModel.name
      },
      settings: {
        status: settings.status,
        otherFeatures: settings.otherFeatures,
        width: settings.width,
        height: settings.height
      }
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching 3D model:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};