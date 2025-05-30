import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useActionData, useNavigation, useSubmit, useNavigate } from '@remix-run/react';
import { Frame, Page, Toast, Card, Button, Text, Modal, Banner } from '@shopify/polaris';
import { authenticate } from '../shopify.server';
import prisma from '../db.server';
import React, { useState, useEffect } from 'react';

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
    const miFormData = await request.formData();
    const miActionType = miFormData.get('action');

    if (miActionType === 'deleteAccount') {
      const account = await prisma.account.findFirst({
        where: { shop },
      });

      if (!account) {
        return json({
          success: false,
          error: 'Account not found',
        }, { status: 404 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.AgeVerificationRules.deleteMany({
          where: { shop },
        });

        await tx.AgeVerificationSettings.deleteMany({
          where: { shop },
        });

        await tx.account.delete({
          where: { id: account.id },
        });
      });

      return json({
        success: true,
        deleteSuccess: true,
        message: 'Account deleted successfully',
      }, { status: 200 });
    }

    const miUsername = miFormData.get('username');
    const miEmail = miFormData.get('email');

    if (!miUsername || !miEmail) {
      return json({ success: false, error: 'Username and email are required' }, { status: 400 });
    }

    const existingAccount = await prisma.account.findFirst({
      where: { shop },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          username: miUsername,
          email: miEmail,
          updatedat: new Date(),
        },
      });
    } else {
      await prisma.account.create({
        data: {
          username: miUsername,
          email: miEmail,
          shop,
          serialkey: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
          createdat: new Date(),
          updatedat: new Date(),
        },
      });
    }

    return json({ success: true, message: 'Account updated successfully' }, { status: 200 });
  } catch (error) {
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
  const [miShowToast, setMiShowToast] = useState(false);
  const [miFormChanged, setMiFormChanged] = useState(false);
  const [miShowDeleteModal, setMiShowDeleteModal] = useState(false);

  const [miFormData, setMiFormData] = useState({
    username: account?.username || '',
    email: account?.email || '',
    serialkey: account?.serialkey || '',
  });

  useEffect(() => {
    if (miActionData && miNavigation.state === 'idle') {
      setMiShowToast(true);
      setMiFormChanged(false);

      if (miActionData.deleteSuccess) {
        setMiFormData({
          username: '',
          email: '',
          serialkey: '',
        });
        setTimeout(() => {
          miNavigate('/app');
        }, 2000);
      }
    }
  }, [miActionData, miNavigation.state, miNavigate]);

  const miHandleInputChange = (miE) => {
    const { name, value } = miE.target;
    setMiFormData(miPrev => ({
      ...miPrev,
      [name]: value,
    }));
    setMiFormChanged(true);
  };

  const miHandleDiscard = () => {
    setMiFormData({
      username: account?.username || '',
      email: account?.email || '',
      serialkey: account?.serialkey || '',
    });
    setMiFormChanged(false);
  };

  const miHandleDeleteAccount = () => {
    miSubmit(
      { action: 'deleteAccount' },
      { method: 'post' },
    );
    setMiShowDeleteModal(false);
  };

  const miToastMarkup = miShowToast && (
    <Toast
      content={miActionData?.message || (miActionData?.success ? 'Changes saved successfully' : 'An error occurred')}
      error={!miActionData?.success}
      onDismiss={() => setMiShowToast(false)}
    />
  );

  const miDeleteModal = (
    <Modal
      open={miShowDeleteModal}
      onClose={() => setMiShowDeleteModal(false)}
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
          onAction: () => setMiShowDeleteModal(false),
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

  if (error) {
    return (
      <Frame>
        <Page title="Account Settings">
          <Card sectioned>
            <Text variant="headingMd" as="h2" color="critical">
              Error Loading Account Information
            </Text>
            <Text as="p" color="critical">
              {error}. Please try refreshing the page or contact support if the issue persists.
            </Text>
          </Card>
        </Page>
      </Frame>
    );
  }

  if (!shop && !error) {
    return (
      <Frame>
        <Page title="Account Settings">
          <Card sectioned>
            <Text variant="headingMd" as="h2">
              Loading Account Information...
            </Text>
          </Card>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <Page title="Account Settings">
        {miDeleteModal}
        {miToastMarkup}
        <Card sectioned title="Account Information">
          <Form method="post">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Serial Key
                </label>
                <input
                  type="text"
                  value={miFormData.serialkey}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #dfe3e8',
                    borderRadius: '4px',
                    fontSize: '14px',
                    background: '#f5f5f5',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={miFormData.username}
                  onChange={miHandleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #dfe3e8',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={miFormData.email}
                  onChange={miHandleInputChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #dfe3e8',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              </div>

              {miFormChanged && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <Button onClick={miHandleDiscard}>
                    Discard
                  </Button>
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

              <Banner status="warning">
                <p>
                  Deleting your account will remove all your data permanently.
                  <Button
                    plain
                    destructive
                    onClick={() => setMiShowDeleteModal(true)}
                    style={{ marginLeft: '8px' }}
                  >
                    Delete Account
                  </Button>
                </p>
              </Banner>
            </div>
          </Form>
        </Card>
      </Page>
    </Frame>
  );
};

export default AccountSettings;