import { json } from '@remix-run/node';
import { Form, useActionData, useNavigation, useLoaderData } from '@remix-run/react';
import { Frame, Page, Card, Text, Button, Toast, Loading, FormLayout, Tabs, TextField } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useState, useEffect, useRef, useCallback } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const miPUBLIC_DIR = path.join(process.cwd(), 'public');

async function miensurePublicDir() {
  try {
    await fs.mkdir(miPUBLIC_DIR, { recursive: true });
  } catch (error) {
    throw new Error('Failed to create public directory: ' + error.message);
  }
}

function misanitizeFileName(str) {
  return str
    .replace(/[:/\\*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const account = await prisma.account.findFirst({
      where: { shop },
      select: { serialkey: true },
    });

    if (!account) {
      return json({ shop, serialkey: null });
    }

    const url = new URL(request.url);
    if (url.pathname === '/download-sample-csv') {
      const sampleCsvPath = path.join(miPUBLIC_DIR, 'sample-3d-models.csv');
      
      try {
        await fs.access(sampleCsvPath);
        
        const fileBuffer = await fs.readFile(sampleCsvPath);
        
        return new Response(fileBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="sample-3d-models.csv"',
          },
        });
      } catch (error) {
        return json(
          { error: 'Sample CSV file not found.', serialkey: account.serialkey, shop },
          { status: 404 }
        );
      }
    }

    return json({ shop, serialkey: account.serialkey });
  } catch (error) {
    console.error('Loader error:', error);
    return json({ error: 'Failed to load page', serialkey: null, shop: null }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();
    const actionType = formData.get('actionType');

    if (actionType === 'createAccount') {
      const username = formData.get('username');
      const email = formData.get('email');

      if (!username || !email) {
        return json(
          { success: false, error: 'Username and email are required', type: 'createAccount' },
          { status: 400 }
        );
      }

      try {
        const serialkey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        const account = await prisma.account.create({
          data: { username, email, serialkey, shop },
        });
        return json(
          {
            success: true,
            message: 'Account created successfully',
            serialkey: account.serialkey,
            type: 'createAccount',
          },
          { status: 200 }
        );
      } catch (error) {
        if (error.code === 'P2002') {
          if (error.meta?.target?.includes('username')) {
            return json(
              { success: false, error: 'This username is already taken. Please choose a different username.', type: 'createAccount' },
              { status: 400 }
            );
          }
          if (error.meta?.target?.includes('email')) {
            return json(
              { success: false, error: 'This email is already in use. Please use a different email address.', type: 'createAccount' },
              { status: 400 }
            );
          }
        }
        throw error;
      }
    }

    const account = await prisma.account.findFirst({
      where: { shop },
      select: { serialkey: true },
    });
    if (!account) {
      return json({ success: false, error: 'No account found for this shop', type: 'auth' }, { status: 403 });
    }

    if (actionType === 'csvUpload') {
      const csvFile = formData.get('csvFile');

      if (!csvFile || csvFile.size === 0) {
        return json({ success: false, error: 'Please upload a CSV file.', type: 'csvUpload' }, { status: 400 });
      }

      const fileName = csvFile.name.toLowerCase();
      if (!fileName.endsWith('.csv')) {
        return json({ success: false, error: 'Please upload a .csv file.', type: 'csvUpload' }, { status: 400 });
      }

      const { parse } = await import('csv-parse');

      const csvBuffer = Buffer.from(await csvFile.arrayBuffer());
      const csvText = csvBuffer.toString('utf-8');

      const records = await new Promise((resolve, reject) => {
        parse(csvText, { columns: true, skip_empty_lines: true }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      if (!records || records.length === 0) {
        return json({ success: false, error: 'CSV file is empty or invalid.', type: 'csvUpload' }, { status: 400 });
      }

      const requiredHeaders = ['productId', 'shop', 'name', 'path'];
      const headers = Object.keys(records[0]);
      const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
      if (missingHeaders.length > 0) {
        return json(
          { success: false, error: `Missing required headers: ${missingHeaders.join(', ')}`, type: 'csvUpload' },
          { status: 400 }
        );
      }

      const productIdShopPairs = new Set();
      for (const record of records) {
        const { productId, shop: recordShop } = record;
        const pairKey = `${productId}:${recordShop}`;
        if (productIdShopPairs.has(pairKey)) {
          return json(
            { success: false, error: `Duplicate productId and shop combination found: productId=${productId}, shop=${recordShop}`, type: 'csvUpload' },
            { status: 400 }
          );
        }
        productIdShopPairs.add(pairKey);
      }

      for (const record of records) {
        let { productId, shop: recordShop, name, path: zipPath } = record;

        if (!productId || !recordShop || !name || !zipPath) {
          return json(
            { success: false, error: `Missing required fields in row: productId=${productId}, shop=${recordShop}, name=${name}, path=${zipPath}`, type: 'csvUpload' },
            { status: 400 }
          );
        }

        if (recordShop !== shop) {
          return json(
            { success: false, error: `Shop in CSV (${recordShop}) does not match the current shop (${shop}).`, type: 'csvUpload' },
            { status: 400 }
          );
        }

        if (!productId.startsWith('gid://shopify/Product/')) {
          if (!/^\d+$/.test(productId)) {
            return json(
              { success: false, error: `Invalid productId format in row: ${productId}. It must be a numeric value.`, type: 'csvUpload' },
              { status: 400 }
            );
          }
          productId = `gid://shopify/Product/${productId}`;
        }

        let gltfFilePath = null;
        if (zipPath) {
          const fullZipPath = path.join(process.cwd(), zipPath);
          try {
            await fs.access(fullZipPath);
          } catch (error) {
            return json(
              { success: false, error: `Zip file not found at path: ${zipPath}`, type: 'csvUpload' },
              { status: 400 }
            );
          }

          const tempDir = path.join(process.cwd(), 'temp', Date.now().toString());
          await fs.mkdir(tempDir, { recursive: true });

          const zip = new AdmZip(fullZipPath);
          zip.extractAllTo(tempDir, true);

          const extractedFiles = await fs.readdir(tempDir, { recursive: true });
          const gltfFile = extractedFiles.find(file =>
            file.toLowerCase().endsWith('.gltf') || file.toLowerCase().endsWith('.glb')
          );
          if (!gltfFile) {
            await fs.rm(tempDir, { recursive: true, force: true });
            return json(
              { success: false, error: `No .gltf or .glb file found in zip: ${zipPath}`, type: 'csvUpload' },
              { status: 400 }
            );
          }

          await miensurePublicDir();

          const sanitizedProductId = misanitizeFileName(productId);

          const gltfFileName = `${Date.now()}-${sanitizedProductId}-${path.basename(gltfFile)}`;
          const gltfFileDestPath = path.join(miPUBLIC_DIR, gltfFileName);

          const gltfFileSourcePath = path.join(tempDir, gltfFile);
          await fs.copyFile(gltfFileSourcePath, gltfFileDestPath);

          gltfFilePath = `/public/${gltfFileName}`;

          await fs.rm(tempDir, { recursive: true, force: true });
        }

        await prisma.threeDProductViewerModel.upsert({
          where: {
            productId_shop: {
              productId,
              shop: recordShop,
            },
          },
          update: {
            name,
            zipFile: gltfFilePath,
          },
          create: {
            productId,
            shop: recordShop,
            name,
            zipFile: gltfFilePath,
            createdAt: new Date().toISOString(),
          },
        });
      }

      return json({ success: true, message: 'CSV processed successfully. Products have been added/updated.', type: 'csvUpload' });
    }

    if (actionType === 'zipUpload') {
      const zipFiles = formData.getAll('zipFile');

      if (!zipFiles || zipFiles.length === 0 || zipFiles.every(file => file.size === 0)) {
        return json(
          { success: false, error: 'Please upload at least one ZIP file.', type: 'zipUpload' },
          { status: 400 }
        );
      }

      await miensurePublicDir();

      const results = [];
      for (const zipFile of zipFiles) {
        const fileName = zipFile.name.toLowerCase();
        if (!fileName.endsWith('.zip')) {
          results.push({ fileName: zipFile.name, success: false, error: 'Please upload a .zip file.' });
          continue;
        }

        try {
          const arrayBuffer = await zipFile.arrayBuffer();
          const fileBuffer = Buffer.from(arrayBuffer);

          const zip = new AdmZip(fileBuffer);
          const zipEntries = zip.getEntries();
          const hasGltfOrGlb = zipEntries.some(entry =>
            entry.entryName.toLowerCase().endsWith('.gltf') || entry.entryName.toLowerCase().endsWith('.glb')
          );

          if (!hasGltfOrGlb) {
            results.push({
              fileName: zipFile.name,
              success: false,
              error: 'The ZIP file does not contain any .gltf or .glb files.',
            });
            continue;
          }

          const originalFileName = zipFile.name;
          const filePath = path.join(miPUBLIC_DIR, originalFileName);

          try {
            await fs.access(filePath);
            results.push({
              fileName: zipFile.name,
              success: false,
              error: `A file with the name ${originalFileName} already exists. Please rename the file and try again.`,
            });
            continue;
          } catch (error) {
    
          }

          await fs.writeFile(filePath, fileBuffer);

          results.push({
            fileName: zipFile.name,
            success: true,
            message: 'Zip file uploaded successfully.',
            filePath: `/public/${originalFileName}`,
          });
        } catch (error) {
          console.error(`Error processing ZIP file ${zipFile.name}:`, error);
          results.push({
            fileName: zipFile.name,
            success: false,
            error: 'Failed to process the ZIP file.',
          });
        }
      }

      const allSuccessful = results.every(result => result.success);
      const message = allSuccessful
        ? `Successfully uploaded ${results.length} ZIP file${results.length > 1 ? 's' : ''}.`
        : `Processed ${results.length} ZIP file${results.length > 1 ? 's' : ''}. Some files had errors.`;

      return json({
        success: allSuccessful,
        message,
        type: 'zipUpload',
        results,
      });
    }

    return json({ success: false, error: 'Invalid action type.', type: 'unknown' }, { status: 400 });
  } catch (error) {
    console.error('Action error:', error);
    return json({ success: false, error: 'Failed to process request: ' + error.message, type: 'unknown' }, { status: 500 });
  }
}

const miBulkUploadPage = () => {
  const miLoaderData = useLoaderData();
  const miActionData = useActionData();
  const miNavigation = useNavigation();
  const [miShowToast, miSetShowToast] = useState(false);
  const [miToastMessage, miSetToastMessage] = useState('');
  const [miToastError, miSetToastError] = useState(false);
  const [miUploadedZipFilePaths, miSetUploadedZipFilePaths] = useState([]);
  const [miAccountForm, miSetAccountForm] = useState({ username: '', email: '' });
  const [miEmailError, miSetEmailError] = useState('');
  const miCsvFileInputRef = useRef(null);
  const miZipFileInputRef = useRef(null);
  const miCsvFormRef = useRef(null);
  const miZipFormRef = useRef(null);

  const [miSelectedTab, miSetSelectedTab] = useState(0);
  const miTabs = [
    { id: 'csv-upload', content: 'Upload CSV File' },
    { id: 'zip-upload', content: 'Upload Zip Files' },
  ];

  const miValidateEmail = (email) => {
    const miEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      return 'Email is required';
    }
    if (!miEmailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  const miHandleAccountChange = (field, value) => {
    miSetAccountForm(prev => ({
      ...prev,
      [field]: value,
    }));
    if (field === 'email') {
      miSetEmailError(miValidateEmail(value));
    }
  };

  const miHandleTabChange = useCallback((miSelectedTabIndex) => {
    miSetSelectedTab(miSelectedTabIndex);
  }, []);

  useEffect(() => {
    if (miActionData && miNavigation.state === 'idle') {
      if (miActionData.success) {
        miSetToastMessage(miActionData.message);
        miSetToastError(false);
        miSetShowToast(true);
        if (miActionData.type === 'csvUpload' && miCsvFileInputRef.current && miCsvFormRef.current) {
          miCsvFileInputRef.current.value = '';
          miCsvFormRef.current.reset();
        } else if (miActionData.type === 'zipUpload' && miZipFileInputRef.current && miZipFormRef.current) {
          const miSuccessfulUploads = miActionData.results
            .filter(result => result.success)
            .map(result => result.filePath);
          miSetUploadedZipFilePaths(miSuccessfulUploads);
          miZipFileInputRef.current.value = '';
          miZipFormRef.current.reset();
        } else if (miActionData.type === 'createAccount') {
          miSetAccountForm({ username: '', email: '' });
          miSetEmailError('');
          window.location.reload();
        }
      } else if (miActionData.error || miActionData.results?.some(result => !result.success)) {
        const miErrorMessage = miActionData.results
          ? miActionData.results
              .filter(result => !result.success)
              .map(result => `${result.fileName}: ${result.error}`)
              .join('; ')
          : miActionData.error;
        miSetToastMessage(miErrorMessage || miActionData.message);
        miSetToastError(true);
        miSetShowToast(true);
      }
    }
  }, [miActionData, miNavigation.state]);

  const miToastMarkup = miShowToast ? (
    <Toast
      content={miToastMessage}
      error={miToastError}
      onDismiss={() => miSetShowToast(false)}
    />
  ) : null;

  if (miLoaderData.error) {
    return (
      <Frame>
        <Page title="Bulk Upload 3D Models">
          <Card>
            <Text variant="headingMd" as="h2" tone="critical">
              Error
            </Text>
            <Text as="p" tone="critical">
              {miLoaderData.error}. Please try refreshing the page or contact support if the issue persists.
            </Text>
          </Card>
        </Page>
      </Frame>
    );
  }

  if (!miLoaderData.serialkey) {
    return (
      <Frame>
        <Page title="Bulk Upload 3D Models">
          <Card>
            <Text variant="headingMd" as="h2">
              No Account Found
            </Text>
            <Text as="p" tone="subdued">
              Please create an account to upload 3D models for this shop.
            </Text>
            <Form method="post" style={{ marginTop: '20px' }}>
              <input type="hidden" name="actionType" value="createAccount" />
              <FormLayout>
                <TextField
                  label="Username"
                  name="username"
                  value={miAccountForm.username}
                  onChange={(value) => miHandleAccountChange('username', value)}
                  autoComplete="off"
                  placeholder="Enter username"
                  required
                  error={miActionData?.error && miActionData.type === 'createAccount' && miActionData.error.includes('username') ? miActionData.error : null}
                />
                <TextField
                  label="Email"
                  type="email"
                  name="email"
                  value={miAccountForm.email}
                  onChange={(value) => miHandleAccountChange('email', value)}
                  autoComplete="email"
                  placeholder="Enter email"
                  required
                  error={
                    (miActionData?.error && miActionData.type === 'createAccount' && miActionData.error.includes('email')) ? miActionData.error :
                    miEmailError
                  }
                />
                {miActionData?.error && miActionData.type === 'createAccount' && !miActionData.error.includes('username') && !miActionData.error.includes('email') && (
                  <Text as="p" tone="critical">
                    {miActionData.error}
                  </Text>
                )}
                <Button
                  primary
                  submit
                  disabled={
                    !miAccountForm.username ||
                    !miAccountForm.email ||
                    !!miEmailError ||
                    miNavigation.state === 'submitting'
                  }
                  loading={miNavigation.state === 'submitting'}
                >
                  Create Account
                </Button>
              </FormLayout>
            </Form>
          </Card>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {miNavigation.state === 'submitting' && <Loading />}
      {miToastMarkup}
      <Page title="Bulk Upload 3D Models">
        <Card>
          <Tabs tabs={miTabs} selected={miSelectedTab} onSelect={miHandleTabChange}>
            {miSelectedTab === 0 ? (
              <div style={{ paddingTop: '20px' }}>
                <Text variant="headingMd" as="h2">
                  Upload CSV File
                </Text>
                <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                  <a
                    href="/download-sample-csv"
                    style={{ color: '#0066cc', textDecoration: 'underline' }}
                  >
                    Download Sample CSV
                  </a>
                </div>
                <Form method="post" encType="multipart/form-data" ref={miCsvFormRef}>
                  <input type="hidden" name="actionType" value="csvUpload" />
                  <FormLayout>
                    <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center' }}>
                      <label htmlFor="csvFile" style={{ marginRight: '10px' }}>
                        Upload file here <span style={{ color: 'red' }}>*</span>
                      </label>
                      <input
                        type="file"
                        id="csvFile"
                        name="csvFile"
                        accept=".csv"
                        style={{ display: 'inline-block', marginRight: '10px' }}
                        ref={miCsvFileInputRef}
                      />
                    </div>
                    <Text as="p" tone="subdued">
                      Upload a CSV file with relative paths to ZIP files in the <code>path</code> column (e.g., <code>public/filename.zip</code> for files uploaded via the ZIP upload tab).
                    </Text>
                    <div style={{ marginTop: '20px' }}>
                      <Button
                        primary
                        submit
                        loading={miNavigation.state === 'submitting' && miActionData?.type !== 'zipUpload'}
                        disabled={miNavigation.state === 'submitting'}
                      >
                        {miNavigation.state === 'submitting' && miActionData?.type !== 'csvUpload' ? 'Processing...' : 'Save'}
                      </Button>
                    </div>
                  </FormLayout>
                </Form>
              </div>
            ) : (
              <div style={{ paddingTop: '20px' }}>
                <Text variant="headingMd" as="h2">
                  Upload Zip Files
                </Text>
                <Form method="post" encType="multipart/form-data" ref={miZipFormRef}>
                  <input type="hidden" name="actionType" value="zipUpload" />
                  <FormLayout>
                    <div style={{ marginTop: '20px' }}>
                      <label htmlFor="zipFile">
                        Upload zip files here <span style={{ color: 'red' }}>*</span>
                      </label>
                      <input
                        type="file"
                        id="zipFile"
                        name="zipFile"
                        accept=".zip"
                        multiple
                        style={{ display: 'block', marginTop: '8px' }}
                        ref={miZipFileInputRef}
                      />
                    </div>
                    <Text as="p" tone="subdued" style={{ marginTop: '8px' }}>
                      Upload one or more zip files containing 3D model files (.gltf or .glb).
                    </Text>
                    <div style={{ marginTop: '20px' }}>
                      <Button
                        primary
                        submit
                        loading={miNavigation.state === 'submitting' && miActionData?.type !== 'csvUpload'}
                        disabled={miNavigation.state === 'submitting'}
                      >
                        {miNavigation.state === 'submitting' && miActionData?.type !== 'csvUpload' ? 'Uploading...' : 'Upload'}
                      </Button>
                    </div>
                  </FormLayout>
                </Form>
                {miUploadedZipFilePaths.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <Text variant="bodyMd" as="p">
                      Uploaded files saved at:
                    </Text>
                    <ul>
                      {miUploadedZipFilePaths.map((miFilePath, miIndex) => (
                        <li key={miIndex}>
                          <Text variant="bodyMd" as="p">
                            <code>{miFilePath}</code>
                          </Text>
                        </li>
                      ))}
                    </ul>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      These files are stored on the server. You can access them in the <code>public/</code> directory.
                    </Text>
                  </div>
                )}
              </div>
            )}
          </Tabs>
        </Card>
      </Page>
    </Frame>
  );
};

export default miBulkUploadPage;