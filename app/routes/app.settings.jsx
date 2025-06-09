import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation, useSubmit, useNavigate } from '@remix-run/react';
import { Frame, Page, Toast, Card, Button, Text, Modal, Banner, Layout, Spinner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import React, { useState, useEffect } from 'react';
import NavigationBar from './NavigationBar';

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    if (!session?.shop) {
      throw new Error('Shop not found in session');
    }

    const shop = session.shop;
    const account = await prisma.account.findFirst({
      where: { shop },
    });

    if (!account) {
      return json({
        account: null,
        shop,
      });
    }

    return json({
      account,
      shop,
    });
  } catch (error) {
    return json({
      account: null,
      shop: null,
      error: 'Failed to load account information',
    }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    if (!session?.shop) {
      return redirect('/auth/login');
    }

    const shop = session.shop;
    const formData = await request.formData();
    const actionType = formData.get('action');

    if (actionType === 'deleteAccount') {
      const account = await prisma.account.findFirst({
        where: { shop },
      });

      if (!account) {
        return json({
          success: false,
          error: 'Account not found',
        }, { status: 404 });
      }

      await prisma.account.delete({
        where: { id: account.id },
      });

      return json({
        success: true,
        deleteSuccess: true,
        message: 'Account deleted successfully',
      }, { status: 200 });
    }

    const username = formData.get('username');
    const email = formData.get('email');

    if (!username || !email) {
      return json({ success: false, error: 'Username and email are required' }, { status: 400 });
    }

    const existingAccount = await prisma.account.findFirst({
      where: { shop },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          username,
          email,
          updatedat: new Date(),
        },
      });
    } else {
      await prisma.account.create({
        data: {
          username,
          email,
          shop,
          serialkey: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          createdat: new Date(),
          updatedat: new Date(),
        },
      });
    }

    return json({ success: true, message: 'Account updated successfully' }, { status: 200 });
  } catch (error) {
    console.error('Action error:', error);
    return json({
      success: false,
      error: `Operation failed: ${error.message}`,
    }, { status: 500 });
  }
};
const AccountSettings = () => {
  const miLoaderData = useLoaderData() || {};
  const { account, shop, error } = miLoaderData;
  const miActionData = useActionData();
  const miNavigation = useNavigation();
  const miSubmit = useSubmit();
  const miNavigate = useNavigate();
  const [miShowToast, miSetShowToast] = useState(false);
  const [miFormChanged, miSetFormChanged] = useState(false);
  const [miShowDeleteModal, miSetShowDeleteModal] = useState(false);

  const [miFormData, miSetFormData] = useState({
    username: account?.username || '',
    email: account?.email || '',
    serialkey: account?.serialkey || '',
    shopUrl: shop || '',
  });

  useEffect(() => {
    if (miActionData && miNavigation.state === 'idle') {
      miSetShowToast(true);
      miSetFormChanged(false);

      if (miActionData.deleteSuccess) {
        miSetFormData({
          username: '',
          email: '',
          serialkey: '',
          shopUrl: '',
        });
        setTimeout(() => {
          miNavigate('/app');
        }, 2000);
      }
    }
  }, [miActionData, miNavigation.state, miNavigate]);

  const miHandleInputChange = (e) => {
    const { name, value } = e.target;
    miSetFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    miSetFormChanged(true);
  };

  const miHandleDiscard = () => {
    miSetFormData({
      username: account?.username || '',
      email: account?.email || '',
      serialkey: account?.serialkey || '',
      shopUrl: shop || '',
    });
    miSetFormChanged(false);
  };

  const miHandleDeleteAccount = () => {
    miSubmit(
      { action: 'deleteAccount' },
      { method: 'post' },
    );
    miSetShowDeleteModal(false);
  };

  const miToastMarkup = miShowToast && (
    <Toast
      content={miActionData?.message || (miActionData?.success ? 'Changes saved successfully' : 'An error occurred')}
      error={!miActionData?.success}
      onDismiss={() => miSetShowToast(false)}
    />
  );

  const miDeleteModal = (
    <Modal
      open={miShowDeleteModal}
      onClose={() => miSetShowDeleteModal(false)}
      title="Delete Account"
      primaryAction={{
        content: 'Delete',
        destructive: true,
        onAction: miHandleDeleteAccount,
        loading: miNavigation.state === 'submitting',
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: () => miSetShowDeleteModal(false),
        },
      ]}
    >
      <Modal.Section>
        <Text as="p">
          Are you sure you want to delete your account? This will remove all associated data (settings, rules) and cannot be undone.
        </Text>
      </Modal.Section>
    </Modal>
  );

  const isNavigating = miNavigation.state !== 'idle';

  if (error) {
    return (
      <Frame loading={isNavigating}>
        <Page title="Account">
          <Layout>
            <Layout.Section>
              <NavigationBar />
              <Card sectioned>
                <Text variant="headingMd" as="h2" color="critical">
                  Error Loading Account Information
                </Text>
                <Text as="p" color="critical">
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
      <Frame loading={isNavigating}>
        <Page title="Account">
          <Layout>
            <Layout.Section>
              <NavigationBar />
              <Card sectioned>
                <Text variant="headingMd" as="h2">
                  Loading Account Information...
                </Text>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame loading={isNavigating}>
      <Page title="Account">
        {miDeleteModal}
        {miToastMarkup}
        <Layout>
          <Layout.Section>
            <NavigationBar />
            <Card sectioned>
              <Form method="post">
                <div style={{ display: 'flex', gap: '20px' }}>
                  {/* Left Section: Username and Email */}
                  <div style={{ flex: 1 }}>
                    <Text variant="headingSm" as="h3">
                      User name
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px', marginBottom: '16px', position: 'relative' }}>
                      <img
                        src="/UsrAccount.svg"
                        alt="User"
                        style={{ width: '40px', height: '40px' }}
                      />
                      <div style={{ position: 'relative', flex: 1, marginLeft: '8px' }}>
                        <input
                          type="text"
                          name="username"
                          value={miFormData.username}
                          onChange={miHandleInputChange}
                          style={{
                            width: '100%',
                            padding: '10px 40px 10px 10px',
                            border: '1px solid #dfe3e8',
                            borderRadius: '4px',
                            fontSize: '14px',
                            background: '#f5f5f5',
                            boxSizing: 'border-box',
                          }}
                        />
                        <img
                          src="/edit.svg"
                          alt="Edit"
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                          }}
                          onClick={() => {}}
                        />
                      </div>
                    </div>

                    <Text variant="headingSm" as="h3">
                      Email
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px', position: 'relative' }}>
                      <img
                        src="/Mail.svg"
                        alt="Email"
                        style={{ width: '40px', height: '40px' }}
                      />
                      <div style={{ position: 'relative', flex: 1, marginLeft: '8px' }}>
                        <input
                          type="email"
                          name="email"
                          value={miFormData.email}
                          onChange={miHandleInputChange}
                          style={{
                            width: '100%',
                            padding: '10px 40px 10px 10px',
                            border: '1px solid #dfe3e8',
                            borderRadius: '4px',
                            fontSize: '14px',
                            background: '#f5f5f5',
                            boxSizing: 'border-box',
                          }}
                        />
                        <img
                          src="/edit.svg"
                          alt="Edit"
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                          }}
                          onClick={() => {}}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Shop URL */}
                  <div style={{ flex: 1 }}>
                    <Text variant="headingSm" as="h3">
                      Shop URL
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px', position: 'relative' }}>
                      <img
                        src="/Domain.svg"
                        alt="Shop"
                        style={{ width: '40px', height: '40px' }}
                      />
                      <div style={{ position: 'relative', flex: 1, marginLeft: '8px' }}>
                        <input
                          type="text"
                          name="shopUrl"
                          value={miFormData.shopUrl}
                          readOnly
                          style={{
                            width: '100%',
                            padding: '10px 40px 10px 10px',
                            border: '1px solid #dfe3e8',
                            borderRadius: '4px',
                            fontSize: '14px',
                            background: '#f5f5f5',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {miFormChanged && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                    <Button onClick={miHandleDiscard}>Discard</Button>
                    <Button
                      primary
                      submit
                      loading={miNavigation.state === 'submitting'}
                      disabled={miNavigation.state === 'submitting'}
                    >
                      Save Changes
                    </Button>
                  </div>
                )}

                <div style={{ marginTop: '20px' }}>
                  <Banner status="info">
                    <p>
                      Deleting your account will remove all your data permanently.
                      <Button
                        plain
                        destructive
                        onClick={() => miSetShowDeleteModal(true)}
                        style={{ marginLeft: '8px' }}
                      >
                        Delete Account
                      </Button>
                    </p>
                  </Banner>
                </div>
              </Form>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
};

export default AccountSettings;
