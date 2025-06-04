import { json } from '@remix-run/node';
import { useLoaderData, Form, useSubmit, useActionData, useNavigation, useFetcher } from '@remix-run/react';
import { Frame, Page, Card, ResourceList, Thumbnail, Text, Button, Toast, TextField, FormLayout, BlockStack, Layout, Spinner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import { useState, useCallback, useEffect, useRef } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import NavigationBar from './NavigationBar';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const MiFullScreenLoader = () => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
    }}
  >
    <Spinner accessibilityLabel="Loading" size="large" />
  </div>
);

async function miEnsurePublicDir() {
  try {
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
  } catch (error) {
    throw new Error('Failed to create public directory.');
  }
}

function miSanitizeFileName(str) {
  return str
    .replace(/[:/\\*?"<>|]/g, '_')
    .replace(/\s+/g, '_');
}

export async function loader({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    const account = await prisma.account.findFirst({
      where: { shop },
      select: { serialkey: true },
    });

    if (!account) {
      return json({
        shop,
        serialkey: null,
        products: [],
        threeDModels: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
        search: '',
      });
    }

    const miUrl = new URL(request.url);
    const miAfter = miUrl.searchParams.get('after');
    const miBefore = miUrl.searchParams.get('before');
    const miSearch = miUrl.searchParams.get('search') || '';

    const response = await admin.graphql(
      `#graphql
      query($first: Int, $last: Int, $after: String, $before: String, $query: String) {
        products(first: $first, last: $last, after: $after, before: $before, query: $query) {
          edges {
            node {
              id
              title
              featuredMedia {
                ... on MediaImage {
                  image {
                    url
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }`,
      {
        variables: {
          first: miBefore ? null : 10,
          last: miBefore ? 10 : null,
          after: miAfter,
          before: miBefore,
          query: miSearch ? `title:*${miSearch}*` : null
        }
      }
    );
    const miProductsData = await response.json();
    const miProducts = miProductsData.data.products.edges.map(edge => ({
      ...edge.node,
      cursor: edge.cursor
    }));
    const miPageInfo = miProductsData.data.products.pageInfo;

    await Promise.all(miProducts.map(async (product) => {
      await prisma.product.upsert({
        where: { id_shop: { id: product.id, shop: session.shop } },
        update: { title: product.title, imageSrc: product.featuredMedia?.image?.url },
        create: { id: product.id, shop: session.shop, title: product.title, imageSrc: product.featuredMedia?.image?.url }
      });
    }));
    const threeDModels = await prisma.threeDProductViewerModel.findMany({
      where: { shop: session.shop },
      select: { productId: true, name: true, zipFile: true }
    });
    return json({ products: miProducts, threeDModels, pageInfo: miPageInfo, search: miSearch, shop, serialkey: account.serialkey });
  } catch (error) {
    console.error('Loader error occurred:', error.message);
    return json({ error: 'Failed to load products and 3D models', serialkey: null, shop: null }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const miFormData = await request.formData();
    const miActionType = miFormData.get('actionType');

    if (miActionType === 'createAccount') {
      const miUsername = miFormData.get('username');
      const miEmail = miFormData.get('email');

      if (!miUsername || !miEmail) {
        return json(
          { success: false, error: 'Username and email are required', type: 'createAccount' },
          { status: 400 }
        );
      }

      try {
        const miSerialkey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

        const account = await prisma.account.create({
          data: { username: miUsername, email: miEmail, serialkey: miSerialkey, shop },
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

    if (miActionType === 'delete') {
      const miProductId = miFormData.get('productId');
      const threeDModel = await prisma.threeDProductViewerModel.findUnique({
        where: {
          productId_shop: {
            productId: miProductId,
            shop: session.shop
          }
        }
      });

      if (!threeDModel) {
        return json({ success: false, error: '3D model not found', type: 'delete' }, { status: 404 });
      }

      if (threeDModel.zipFile) {
        const miFilePath = path.join(process.cwd(), threeDModel.zipFile);
        try {
          await fs.unlink(miFilePath);
        } catch (error) {
          console.error('Error deleting file:', error.message);
        }
      }

      await prisma.threeDProductViewerModel.delete({
        where: {
          productId_shop: {
            productId: miProductId,
            shop: session.shop
          }
        }
      });

      return json({ success: true, message: '3D model deleted successfully', type: 'delete' });
    }

    const miProductId = miFormData.get('productId');
    const miName = miFormData.get('name');
    const miZipFile = miFormData.get('zipFile');

    if (!miName) {
      return json({ success: false, error: 'Name is required', type: 'threeDModel' }, { status: 400 });
    }

    let miGltfFilePath = null;
    if (miZipFile && miZipFile instanceof File && miZipFile.size > 0) {
      const miFileName = miZipFile.name.toLowerCase();
      if (!miFileName.endsWith('.zip')) {
        return json({ success: false, error: 'Please upload a .zip file containing .glTF or .GLB files', type: 'threeDModel' }, { status: 400 });
      }

      await miEnsurePublicDir();

      const miTempDir = path.join(process.cwd(), 'temp', Date.now().toString());
      await fs.mkdir(miTempDir, { recursive: true });

      const miZipBuffer = Buffer.from(await miZipFile.arrayBuffer());
      const miTempZipPath = path.join(miTempDir, miFileName);
      await fs.writeFile(miTempZipPath, miZipBuffer);

      const miZip = new AdmZip(miTempZipPath);
      miZip.extractAllTo(miTempDir, true);

      const miExtractedFiles = await fs.readdir(miTempDir, { recursive: true });
      const miGltfFile = miExtractedFiles.find(file => 
        file.toLowerCase().endsWith('.gltf') || file.toLowerCase().endsWith('.glb')
      );
      if (!miGltfFile) {
        await fs.rm(miTempDir, { recursive: true, force: true });
        return json({ success: false, error: 'Zip file must contain a .gltf or .glb file', type: 'threeDModel' }, { status: 400 });
      }

      const miSanitizedProductId = miSanitizeFileName(miProductId);
      const miGltfFileName = `${Date.now()}-${miSanitizedProductId}-${path.basename(miGltfFile)}`;
      const miGltfFileDestPath = path.join(PUBLIC_DIR, miGltfFileName);

      const miGltfFileSourcePath = path.join(miTempDir, miGltfFile);
      await fs.copyFile(miGltfFileSourcePath, miGltfFileDestPath);

      miGltfFilePath = `/public/${miGltfFileName}`;

      await fs.rm(miTempDir, { recursive: true, force: true });
    }

    const miResult = await prisma.threeDProductViewerModel.upsert({
      where: {
        productId_shop: {
          productId: miProductId,
          shop: session.shop
        }
      },
      update: {
        name: miName,
        zipFile: miGltfFilePath,
      },
      create: {
        productId: miProductId,
        shop: session.shop,
        name: miName,
        zipFile: miGltfFilePath,
        createdAt: new Date().toISOString()
      }
    });
    return json({ success: true, message: '3D model added successfully', type: 'threeDModel', actionId: Date.now() });
  } catch (error) {
    console.error('Action error:', error);
    return json({ success: false, error: 'Failed to process request: ' + error.message, type: 'unknown' }, { status: 500 });
  }
}

const ThreeDProductViewerPage = () => {
  const miLoaderData = useLoaderData();
  const miActionData = useActionData();
  const miSubmit = useSubmit();
  const miNavigation = useNavigation();
  const miFetcher = useFetcher();
  const [miSelectedProductId, setMiSelectedProductId] = useState(null);
  const [miShowToast, setMiShowToast] = useState(false);
  const [miToastMessage, setMiToastMessage] = useState('');
  const [miToastError, setMiToastError] = useState(false);
  const [miFileNames, setMiFileNames] = useState({});
  const [miSearchQuery, setMiSearchQuery] = useState(miLoaderData.search || '');
  const [miProducts, setMiProducts] = useState(miLoaderData.products);
  const [miThreeDModels, setMiThreeDModels] = useState(miLoaderData.threeDModels);
  const [miPageInfo, setMiPageInfo] = useState(miLoaderData.pageInfo);
  const [miAccountForm, setMiAccountForm] = useState({ username: '', email: '' });
  const [miEmailError, setMiEmailError] = useState('');
  const miHandledActionIds = useRef(new Set());

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

  const miHandleAccountChange = (miField, miValue) => {
    setMiAccountForm(miPrev => ({
      ...miPrev,
      [miField]: miValue,
    }));
    if (miField === 'email') {
      setMiEmailError(miValidateEmail(miValue));
    }
  };

  const miHandleFileUpload = (miProductId) => (miE) => {
    const miFile = miE.target.files[0];
    if (miFile) {
      const miFileName = miFile.name.toLowerCase();
      if (!miFileName.endsWith('.zip')) {
        setMiToastMessage('Please upload a .zip file containing .glTF or .GLB files');
        setMiToastError(true);
        setMiShowToast(true);
        miE.target.value = null;
        return;
      }
      setMiFileNames((miPrev) => ({
        ...miPrev,
        [miProductId]: miFile.name
      }));
    } else {
      setMiFileNames((miPrev) => ({
        ...miPrev,
        [miProductId]: 'No file selected.'
      }));
    }
  };

  const miHandleSubmit = (miProductId) => (miE) => {
    miE.preventDefault();
    const miFormData = new FormData(miE.currentTarget);
    miFormData.append('actionType', 'upload');
    miSubmit(miFormData, { method: 'post', encType: 'multipart/form-data', action: '/app/chooseproducts' });
  };

  const miHandleDelete = (miProductId) => () => {
    const miConfirmed = window.confirm('Are you sure?');
    if (miConfirmed) {
      const miFormData = new FormData();
      miFormData.append('actionType', 'delete');
      miFormData.append('productId', miProductId);
      miSubmit(miFormData, { method: 'post', encType: 'multipart/form-data', action: '/app/chooseproducts' });
    }
  };

  const miHandlePreview = (miProductId) => () => {
    const miShop = miLoaderData.shop;
    const miPreviewUrl = `https://${miShop}/apps/threed/full-3d-model?shop=${encodeURIComponent(miShop)}&productId=${encodeURIComponent(miProductId)}`;
    window.open(miPreviewUrl, '_blank');
  };

  const miHandleSearch = useCallback((miValue) => {
    setMiSearchQuery(miValue);
    const miParams = new URLSearchParams(window.location.search);
    if (miValue) {
      miParams.set('search', miValue);
    } else {
      miParams.delete('search');
    }
    miParams.delete('after');
    miParams.delete('before');
    miFetcher.load(`/app/chooseproducts?${miParams.toString()}`);
  }, [miFetcher]);

  const miHandlePageChange = useCallback((miDirection) => {
    const miParams = new URLSearchParams(window.location.search);
    if (miDirection === 'next') {
      miParams.set('after', miPageInfo.endCursor);
      miParams.delete('before');
    } else {
      miParams.set('before', miPageInfo.startCursor);
      miParams.delete('after');
    }
    miFetcher.load(`/app/chooseproducts?${miParams.toString()}`);
  }, [miFetcher, miPageInfo]);

  useEffect(() => {
    if (miActionData) {
      const miActionId = miActionData.actionId;
      if (miActionId && miHandledActionIds.current.has(miActionId)) {
        return;
      }

      if (miActionData.success) {
        setMiToastMessage(miActionData.message);
        setMiToastError(false);
        setMiShowToast(true);
        if (miActionId) {
          miHandledActionIds.current.add(miActionId);
        }
        if (miActionData.type === 'createAccount') {
          setMiAccountForm({ username: '', email: '' });
          setMiEmailError('');
          miFetcher.load('/app/chooseproducts');
        } else {
          setTimeout(() => {
            setMiShowToast(false);
            setMiFileNames({});
            miFetcher.load('/app/chooseproducts');
          }, 2000);
        }
      } else if (miActionData.error) {
        setMiToastMessage(miActionData.error);
        setMiToastError(true);
        setMiShowToast(true);
      }
    }
  }, [miActionData, miFetcher]);

  useEffect(() => {
    if (miFetcher.data) {
      setMiProducts(miFetcher.data.products || miLoaderData.products);
      setMiThreeDModels(miFetcher.data.threeDModels || miLoaderData.threeDModels);
      setMiSearchQuery(miFetcher.data.search || miLoaderData.search);
      setMiPageInfo(miFetcher.data.pageInfo || miLoaderData.pageInfo);
    }
  }, [miFetcher.data, miLoaderData.products, miLoaderData.threeDModels, miLoaderData.search, miLoaderData.pageInfo]);

  useEffect(() => {
    if (miNavigation.state === 'idle' && miActionData === undefined && miNavigation.formData) {
      setMiToastMessage('Failed to save 3D model: Server timed out. Please try again later.');
      setMiToastError(true);
      setMiShowToast(true);
    }
  }, [miNavigation.state, miActionData, miNavigation.formData]);

  const miToggleToast = useCallback(() => {
    setMiShowToast(false);
  }, []);

  const fieldContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '10px',
    backgroundColor: 'rgb(246, 246, 247)',
    borderRadius: '5px',
    marginBottom: '10px',
  };

  const fieldLabelStyle = {
    fontSize: '14px',
    color: 'rgb(51, 51, 51)',
    margin: '0px',
  };

  const fieldInputStyle = {
    width: '100%',
    padding: '10px',
    border: '1px solid rgb(223, 227, 232)',
    borderRadius: '4px',
    fontSize: '14px',
    background: 'white',
  };

  const sectionHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px',
    cursor: 'pointer',
    backgroundColor: '#f4f6f8',
    borderRadius: '4px',
    marginBottom: '10px',
    borderTop: '2px solid #000000',
  };

  const iconStyle = {
    width: '30px',
    height: '30px',
    paddingTop: '5px',
  };

  const saveButtonStyle = {
    display: 'flex',
    marginTop: '20px',
  };

  const buttonContentStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '5px',
  };

  if (miLoaderData.error) {
    return (
      <Frame>
        <Page title="3D Product Viewer - 3D Models">
          <BlockStack gap="500">
            <Layout>
              <Layout.Section>
                <NavigationBar />
                <Card>
                  <Text variant="headingMd" as="h2" tone="critical">
                    Error
                  </Text>
                  <Text as="p" tone="critical">
                    {miLoaderData.error}. Please try refreshing the page or contact support if the issue persists.
                  </Text>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  if (!miLoaderData.serialkey) {
    return (
      <Frame>
        <Page title="3D Product Viewer - 3D Models">
          <BlockStack gap="500">
            <Layout>
              <Layout.Section>
                <NavigationBar />
                <Card>
                  <Text variant="headingMd" as="h2">
                    No Account Found
                  </Text>
                  <Text as="p" tone="subdued">
                    Please create an account to manage 3D Product Viewer models for this shop.
                  </Text>
                  <Form method="post" style={{ marginTop: '20px' }}>
                    <input type="hidden" name="actionType" value="createAccount" />
                    <FormLayout>
                      <div style={fieldContainerStyle}>
                        <img src="/UsrAccount.svg" alt="Username Icon" style={{ width: '48px', height: '48px' }} />
                        <div style={{ flex: '1 1 0%' }}>
                          <p style={fieldLabelStyle}>Username</p>
                          <TextField
                            name="username"
                            value={miAccountForm.username}
                            onChange={(value) => miHandleAccountChange('username', value)}
                            autoComplete="off"
                            placeholder="Enter username"
                            required
                            style={fieldInputStyle}
                            error={miActionData?.error && miActionData.type === 'createAccount' && miActionData.error.includes('username') ? miActionData.error : null}
                          />
                        </div>
                      </div>
                      <div style={fieldContainerStyle}>
                        <img src="/Mail.svg" alt="Email Icon" style={{ width: '48px', height: '48px' }} />
                        <div style={{ flex: '1 1 0%' }}>
                          <p style={fieldLabelStyle}>Email</p>
                          <TextField
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
                            style={fieldInputStyle}
                          />
                        </div>
                      </div>
                      {miActionData?.error && miActionData.type === 'createAccount' && !miActionData.error.includes('username') && !miActionData.error.includes('email') && (
                        <Text as="p" tone="critical">
                          {miActionData.error}
                        </Text>
                      )}
                      <div style={saveButtonStyle}>
                        <Button
                          submit
                          size="slim"
                          variant='primary'
                          disabled={
                            !miAccountForm.username ||
                            !miAccountForm.email ||
                            !!miEmailError ||
                            miNavigation.state === 'submitting'
                          }
                          loading={miNavigation.state === 'submitting'}
                          style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                        >
                          <div style={buttonContentStyle}>
                            <span>Create Account</span>
                            <img src="/arrow-right.svg" alt="Arrow Right" style={{ width: '16px', height: '16px' }} />
                          </div>
                        </Button>
                      </div>
                    </FormLayout>
                  </Form>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {(miNavigation.state === 'submitting' || miNavigation.state === 'loading') && <MiFullScreenLoader />}
      {miShowToast && (
        <Toast
          content={miToastMessage}
          error={miToastError}
          onDismiss={miToggleToast}
        />
      )}
      <Page title="3D Product Viewer - 3D Models">
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <NavigationBar />
              <Card>
                <div style={{ marginBottom: '2rem' }}>
                  <div style={fieldContainerStyle}>
                    <img src="/search.svg" alt="Search Icon" style={{ width: '48px', height: '48px' }} />
                    <div style={{ flex: '1 1 0%' }}>
                      <p style={fieldLabelStyle}>Search Products</p>
                      <TextField
                        value={miSearchQuery}
                        onChange={miHandleSearch}
                        placeholder="Search by product title..."
                        autoComplete="off"
                        style={fieldInputStyle}
                      />
                    </div>
                  </div>
                </div>
                <ResourceList
                  resourceName={{ singular: 'product', plural: 'products' }}
                  items={miProducts}
                  renderItem={(miProduct) => {
                    const miIsSelected = miSelectedProductId === miProduct.id;
                    const miThreeDModel = miThreeDModels.find((tdm) => tdm.productId === miProduct.id);
                    const miSavedFileName = miThreeDModel?.zipFile ? miThreeDModel.name : 'No file selected.';
                    const miDisplayFileName = miFileNames[miProduct.id] || miSavedFileName;

                    return (
                      <div style={{ marginBottom: '1rem' }}>
                        <ResourceList.Item
                          id={miProduct.id}
                          media={<Thumbnail source={miProduct.featuredMedia?.image?.url || ''} alt={miProduct.title} />}
                          onClick={() => setMiSelectedProductId(miIsSelected ? null : miProduct.id)}
                        >
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {miProduct.title}
                          </Text>
                        </ResourceList.Item>
                        {miIsSelected && (
                          <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '4px', marginTop: '0.5rem' }}>
                            <div style={sectionHeaderStyle}>
                              <Text variant="headingSm" as="h3">3D Image Upload</Text>
                              <Button
                                onClick={() => setMiSelectedProductId(null)}
                                variant="tertiary"
                                size="slim"
                                style={{ backgroundColor: '#f4f6f8', border: 'none', padding: '8px' }}
                              >
                                <img src="/cancel.svg" alt="Minimize" style={iconStyle} />
                              </Button>
                            </div>
                            <Form method="post" action="/app/chooseproducts" onSubmit={miHandleSubmit(miProduct.id)}>
                              <input type="hidden" name="productId" value={miProduct.id} />
                              <div style={fieldContainerStyle}>
                                <div style={{ flex: '1 1 0%' }}>
                                  <p style={fieldLabelStyle}>Enter the Name</p>
                                  <TextField
                                    name="name"
                                    defaultValue={miThreeDModel?.name || ''}
                                    style={fieldInputStyle}
                                  />
                                </div>
                              </div>
                              <div style={fieldContainerStyle}>
                                <div style={{ flex: '1 1 0%', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ flex: '1' }}>
                                    <p style={fieldLabelStyle}>Upload 3D Image</p>
                                    <input
                                      type="file"
                                      id={`zipFile-${miProduct.id}`}
                                      name="zipFile"
                                      accept=".zip"
                                      onChange={miHandleFileUpload(miProduct.id)}
                                      style={{ width: '100%', padding: '8px', border: '1px solid rgb(223, 227, 232)', borderRadius: '4px' }}
                                    />
                                  </div>
                                  <Text as="span">{miDisplayFileName}</Text>
                                  {miThreeDModel?.zipFile && !miFileNames[miProduct.id] && (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                      <Button
                                        onClick={miHandlePreview(miProduct.id)}
                                        size="slim"
                                        variant="primary"
                                      >
                                        Preview
                                      </Button>
                                      <Button
                                        onClick={miHandleDelete(miProduct.id)}
                                        size="slim"
                                        variant="primary"
                                        tone="critical"
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ marginBottom: '10px', color: '#6d7175', fontSize: '12px' }}>
                                Please upload a .zip file containing .glTF (.gltf) or .GLB (.glb) files.
                              </div>
                              <div style={{ ...saveButtonStyle, marginTop: '10px' }}>
                                <Button
                                  submit
                                  variant="primary"
                                  size="slim"
                                  loading={miNavigation.state === 'submitting'}
                                  disabled={miNavigation.state === 'submitting'}
                                  style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                                >
                                  <div style={buttonContentStyle}>
                                    <span>{miNavigation.state === 'submitting' ? 'Saving...' : 'Save 3D Model'}</span>
                                    <img src="/arrow-right.svg" alt="Arrow Right" style={{ width: '16px', height: '16px' }} />
                                  </div>
                                </Button>
                              </div>
                            </Form>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
                  <Button
                    onClick={() => miHandlePageChange('previous')}
                    disabled={!miPageInfo.hasPreviousPage}
                    style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => miHandlePageChange('next')}
                    disabled={!miPageInfo.hasNextPage}
                    style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                  >
                    Next
                  </Button>
                </div>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </Frame>
  );
};

export default ThreeDProductViewerPage;