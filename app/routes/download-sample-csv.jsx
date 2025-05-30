import { json } from '@remix-run/node';
import path from 'path';
import { promises as fs } from 'fs';

const miSampleCsvPath = path.join(process.cwd(), 'public', 'sample-3d-models.csv');

export const loader = async () => {
  try {
    await fs.access(miSampleCsvPath);

    const miFileContent = await fs.readFile(miSampleCsvPath);

    return new Response(miFileContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="sample-3d-models.csv"',
        'Content-Length': miFileContent.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return json({ error: 'Sample CSV file not found' }, { status: 404 });
  }
};