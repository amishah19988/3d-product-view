import { json } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation } from '@remix-run/react';
import { Frame, Card, FormLayout, TextField, Button, Select, Toast, Loading, Text, Layout, Page } from '@shopify/polaris';
import React, { useState, useEffect } from 'react';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    const shop = session.shop;

    const settings = await prisma.threeDProductViewerSettings.findFirst({
      where: { shop },
    });

    const account = await prisma.account.findFirst({
      where: { shop },
      select: { serialkey: true },
    });

    const responseData = {
      settings: settings
        ? {
            ...settings,
            width: settings.width != null ? settings.width.toString() : '',
            height: settings.height != null ? settings.height.toString() : '',
          }
        : null,
      shop,
      serialkey: account?.serialkey || null,
    };

    return json(responseData);
  } catch (error) {
    console.error('Loader error occurred:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    let errorMessage = 'Failed to load settings';
    if (error.message.includes('Prisma')) {
      errorMessage = 'Database error: Unable to connect or query the database';
    } else if (error.message.includes('authenticate')) {
      errorMessage = 'Authentication error: Unable to authenticate with Shopify';
    }
    console.error('Returning error response:', errorMessage);
    return json({
      settings: null,
      shop: null,
      serialkey: null,
      error: errorMessage,
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);

    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get('action');

    if (actionType === 'createAccount') {
      const username = formData.get('username');
      const email = formData.get('email');

      if (!username || !email) {
        return json(
          { success: false, error: 'Username and email are required' },
          { status: 400 }
        );
      }

      const serialkey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

      const account = await prisma.account.create({
        data: { username, email, serialkey, shop },
      });
      return json(
        {
          success: true,
          message: 'Account created successfully',
          serialkey: account.serialkey,
        },
        { status: 200 }
      );
    }

    const account = await prisma.account.findFirst({
      where: { shop },
      select: { serialkey: true },
    });
    const serialKey = account?.serialkey || '';

    const status = formData.get('status');
    const otherFeatures = formData.get('otherFeatures');
    const width = formData.get('width');
    const height = formData.get('height');

    if (width) {
      const widthNum = parseInt(width, 10);
      if (isNaN(widthNum) || widthNum < 50 || widthNum > 700) {
        return json(
          { error: 'Width must be a number between 50 and 700' },
          { status: 400 }
        );
      }
    }
    if (height) {
      const heightNum = parseInt(height, 10);
      if (isNaN(heightNum) || heightNum < 50 || heightNum > 700) {
        return json(
          { error: 'Height must be a number between 50 and 700' },
          { status: 400 }
        );
      }
    }

    const updatedSettings = await prisma.threeDProductViewerSettings.upsert({
      where: { shop },
      update: {
        serialKey,
        status,
        otherFeatures,
        width: width ? parseInt(width, 10) : null,
        height: height ? parseInt(height, 10) : null,
        updatedAt: new Date().toISOString(),
      },
      create: {
        serialKey,
        status,
        otherFeatures: otherFeatures || 'Auto Zoom in Zoom out and Rotate',
        width: width ? parseInt(width, 10) : null,
        height: height ? parseInt(height, 10) : null,
        shop,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    return json({ success: 'Settings saved successfully' }, { status: 200 });
  } catch (error) {
    return json({ error: 'Failed to save settings', details: error.message }, { status: 500 });
  }
};

const miThreeDProductViewerSettings = () => {
  const { settings, shop, serialkey, error } = useLoaderData();
  const miActionData = useActionData();
  const miNavigation = useNavigation();

  const [miShowToast, miSetShowToast] = useState(false);
  const [miToastMessage, miSetToastMessage] = useState('');
  const [miToastError, miSetToastError] = useState(false);
  const [miAccountForm, miSetAccountForm] = useState({ username: '', email: '' });
  const [miEmailError, miSetEmailError] = useState('');
  const [miWidthError, miSetWidthError] = useState('');
  const [miHeightError, miSetHeightError] = useState('');

  const [miFormData, miSetFormData] = useState({
    serialKey: serialkey || settings?.serialKey || '',
    status: settings?.status || 'enable',
    otherFeatures: settings?.otherFeatures || 'Auto Zoom in Zoom out and Rotate',
    width: settings?.width != null ? settings.width.toString() : '',
    height: settings?.height != null ? settings.height.toString() : '',
  });

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

  const miValidateDimension = (value, field) => {
    if (!value) return '';
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      return `${field} must be a valid number`;
    }
    if (num < 50) {
      return `${field} must be at least 50`;
    }
    if (num > 700) {
      return `${field} cannot exceed 700`;
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

  const miHandleChange = (field, value) => {
    miSetFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    if (field === 'width') {
      miSetWidthError(miValidateDimension(value, 'Width'));
    }
    if (field === 'height') {
      miSetHeightError(miValidateDimension(value, 'Height'));
    }
  };

  useEffect(() => {
    if (miActionData && miActionData.success && miNavigation.state === 'idle') {
      miSetToastMessage(miActionData.success);
      miSetToastError(false);
      miSetShowToast(true);
      if (miActionData.serialkey) {
        miSetFormData(prev => ({ ...prev, serialKey: miActionData.serialkey }));
        miSetAccountForm({ username: '', email: '' });
        miSetEmailError('');
      }
    } else if (miActionData && miActionData.error && miNavigation.state === 'idle') {
      miSetToastMessage(miActionData.error);
      miSetToastError(true);
      miSetShowToast(true);
    }
  }, [miActionData, miNavigation.state]);

  const miToastMarkup = miShowToast ? (
    <Toast
      content={miToastMessage}
      error={miToastError}
      onDismiss={() => miSetShowToast(false)}
    />
  ) : null;

  if (error) {
    return (
      <Frame>
        <Page>
          <Layout>
            <Layout.Section>
              <Card>
                <Text variant="headingMd" as="h2" tone="critical">
                  Error Loading Settings
                </Text>
                <Text as="p" tone="critical">
                  {error}. Please try refreshing the page or contact support if the issue persists.
                </Text>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  if (!shop && !error) {
    return (
      <Frame>
        <Page>
          <Layout>
            <Layout.Section>
              <Card>
                <Text variant="headingMd" as="h2">
                  Loading Settings...
                </Text>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {miNavigation.state === 'submitting' && <Loading />}
      {miToastMarkup}
      <Page>
        <Layout>
          <Layout.Section>
            {!serialkey ? (
              <Card>
                <Text variant="headingMd" as="h2">
                  No Account Found
                </Text>
                <Text as="p" tone="subdued">
                  Please create an account to configure 3D Product Viewer settings for this shop.
                </Text>
                <Form method="post" style={{ marginTop: '20px' }}>
                  <input type="hidden" name="action" value="createAccount" />
                  <FormLayout>
                    <TextField
                      label="Username"
                      name="username"
                      value={miAccountForm.username}
                      onChange={(value) => miHandleAccountChange('username', value)}
                      autoComplete="off"
                      placeholder="Enter username"
                      required
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
                      error={miEmailError}
                    />
                    {miActionData?.error && !miActionData.serialkey && (
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
            ) : (
              <Card>
                <Text variant="headingMd" as="h2">
                  3D Product Viewer Settings
                </Text>
                <Form method="post" style={{ marginTop: '20px' }}>
                  <FormLayout>
                    <Text variant="headingMd" as="h2">
                      License and Status
                    </Text>
                    <TextField
                      label="Serial Key"
                      name="serialKey"
                      value={miFormData.serialKey}
                      onChange={(value) => miHandleChange('serialKey', value)}
                      autoComplete="off"
                      placeholder="Serial key"
                      readOnly
                    />
                    <Select
                      label="Status"
                      name="status"
                      options={[
                        { label: 'Enable', value: 'enable' },
                        { label: 'Disable', value: 'disable' },
                      ]}
                      value={miFormData.status}
                      onChange={(value) => miHandleChange('status', value)}
                    />
                    <Text variant="headingMd" as="h2" style={{ marginTop: '20px' }}>
                      Additional Options and Features
                    </Text>
                    <Select
                      label="Other Features"
                      name="otherFeatures"
                      options={[
                        { label: 'Normal', value: 'Normal' },
                        { label: 'Auto Rotate', value: 'Auto Rotate' },
                        { label: 'Auto Zoom in Zoom out and Rotate', value: 'Auto Zoom in Zoom out and Rotate' },
                        { label: 'Rotate while Scrolling the Screen', value: 'Rotate while Scrolling the Screen' },
                        { label: 'Manual Controls', value: 'Manual Controls' },
                        { label: 'Adjust Metalness and Roughness', value: 'Adjust Metalness and Roughness' },
                      ]}
                      value={miFormData.otherFeatures}
                      onChange={(value) => miHandleChange('otherFeatures', value)}
                    />
                    <TextField
                      label="Width (px)"
                      type="number"
                      name="width"
                      value={miFormData.width}
                      onChange={(value) => miHandleChange('width', value)}
                      placeholder="Enter width in pixels (50-700)"
                      error={miWidthError}
                      min="50"
                      max="700"
                    />
                    <Text as="p" tone="subdued" style={{ marginTop: '4px' }}>
                      Leave blank for Auto set
                    </Text>
                    <TextField
                      label="Height (px)"
                      type="number"
                      name="height"
                      value={miFormData.height}
                      onChange={(value) => miHandleChange('height', value)}
                      placeholder="Enter height in pixels (50-700)"
                      error={miHeightError}
                      min="50"
                      max="700"
                    />
                    <Text as="p" tone="subdued" style={{ marginTop: '4px' }}>
                      Leave blank for Auto set
                    </Text>
                    <Button
                      primary
                      submit
                      loading={miNavigation.state === 'submitting'}
                      disabled={miNavigation.state === 'submitting' || !!miWidthError || !!miHeightError}
                    >
                      {miNavigation.state === 'submitting' ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </FormLayout>
                </Form>
              </Card>
            )}
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
};

export default miThreeDProductViewerSettings;