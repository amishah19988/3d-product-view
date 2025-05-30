import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const miShop = session.shop;
    const miUrl = new URL(request.url);
    const miProductId = miUrl.searchParams.get('productId');

    if (!miProductId) {
      return json({ error: 'Product ID is required' }, { status: 400 });
    }

    const miModel = await prisma.threeDProductViewerModel.findFirst({
      where: { shop: miShop, productId: miProductId },
      select: { name: true, zipFile: true },
    });

    if (!miModel) {
      return json({ error: '3D model not found' }, { status: 404 });
    }

    return json(miModel);
  } catch (error) {
    console.error('Error fetching 3D model:', error);
    return json({ error: 'Failed to fetch 3D model' }, { status: 500 });
  }
};