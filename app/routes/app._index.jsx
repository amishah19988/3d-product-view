import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Spinner,
  List,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useNavigate } from "react-router-dom";
import prisma from "../db.server";
import { SettingOutlined } from "@ant-design/icons";
import { json, redirect } from "@remix-run/node";

export const loader = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const existingAccount = await prisma.account.findFirst({
      where: { shop },
    });

    return json({
      shop,
      existingAccount,
    });
  } catch (error) {
    if (!error.response) {
      return redirect("/auth");
    }
    return json({ shop: null, existingAccount: null });
  }
};

export const action = async ({ request }) => {
  try {
    if (!prisma) {
      throw new Error("Prisma client is not initialized");
    }

    if (!prisma.account) {
      throw new Error("Account model is not available on Prisma client");
    }

    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const username = formData.get("username");
    const email = formData.get("email");
    const shop = session.shop;

    if (!username || !email || !shop) {
      return json(
        { success: false, error: "All fields (username, email, shop) are required" },
        { status: 400 }
      );
    }

    const existingAccount = await prisma.account.findFirst({
      where: { shop },
    });

    if (existingAccount) {
      return json(
        {
          success: true,
          account: existingAccount,
          message: "Account already exists for this shop",
        },
        { status: 200 }
      );
    }

    const serialkey = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const account = await prisma.account.create({
      data: {
        username,
        email,
        serialkey,
        shop,
      },
    });

    return json({ success: true, account }, { status: 200 });
  } catch (error) {
    if (error.code === "P2002") {
      return json(
        {
          success: false,
          error: "Username, email, or serialkey already exists",
        },
        { status: 400 }
      );
    }
    return json(
      {
        success: false,
        error: "An error occurred while creating the account",
        details: error.message,
      },
      { status: 500 }
    );
  }
};

const miFullScreenLoader = () => (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 2000,
    }}
  >
    <Spinner accessibilityLabel="Loading" size="large" />
  </div>
);

export default function Index() {
  const { shop, existingAccount: miInitialAccount } = useLoaderData();
  const miActionData = useActionData();
  const miFetcher = useFetcher();
  const miShopify = useAppBridge();
  const miNavigation = useNavigation();
  const miNavigate = useNavigate();
  const [miAccount, miSetAccount] = useState({ username: "", email: "" });
  const [miCreatedAccount, miSetCreatedAccount] = useState(miInitialAccount);
  const [miEmailError, miSetEmailError] = useState("");
  const [miIsGuideOpen, miSetIsGuideOpen] = useState(false);
  const [miIsAccountOpen, miSetIsAccountOpen] = useState(false);
  const miIsLoading =
    ["loading", "submitting"].includes(miFetcher.state) ||
    miNavigation.state === "submitting" ||
    miNavigation.state === "loading";

  useEffect(() => {
    if (shop) {
      sessionStorage.setItem("shop", shop);
    }
  }, [shop]);

  useEffect(() => {
    if (miActionData?.success && miActionData.account) {
      miSetCreatedAccount(miActionData.account);
      miSetAccount({ username: "", email: "" });
      miSetEmailError("");
    }
  }, [miActionData]);

  const miValidateEmail = (email) => {
    const miEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      return "Email is required";
    }
    if (!miEmailRegex.test(email)) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const miHandleEmailChange = (value) => {
    miSetAccount({ ...miAccount, email: value });
    miSetEmailError(miValidateEmail(value));
  };

  const miHandleRedirect = () => {
    if (!miCreatedAccount) {
      miShopify.toast.show("Please create account first");
      return;
    }
    const miShopDomain = shop || sessionStorage.getItem("shop");
    if (miShopDomain) {
      const miStoreName = miShopDomain.split(".")[0];
      window.open(
        `https://admin.shopify.com/store/${miStoreName}/themes/current/editor?context=apps&template=product`,
        "_blank"
      );
    } else {
      miShopify.toast.show(
        "Could not determine your shop name. Please navigate to your theme editor manually to enable theme block."
      );
    }
  };

  return (
    <Page>
      <TitleBar title="3D Product Viewer" />
      <BlockStack gap="500">
        <Layout>
          {miCreatedAccount && (
            <Layout.Section>
              <Card>
                <div
                  onClick={() => miSetIsGuideOpen(!miIsGuideOpen)}
                  style={{
                    cursor: "pointer",
                    padding: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text as="h2" variant="headingMd">
                    Get Started with 3D Product Viewer
                  </Text>
                  <SettingOutlined style={{ fontSize: "20px", color: "#555" }} />
                </div>
                {miIsGuideOpen && (
                  <div style={{ padding: "0 1rem" }}>
                    <Text
                      as="p"
                      variant="bodyMd"
                      tone="subdued"
                      style={{ marginBottom: "1rem" }}
                    >
                      Follow these steps to set up and configure the 3D Product Viewer in your store, enhancing product visualization for your customers.
                    </Text>
                    <br></br>
                    <List type="number">
                      <List.Item>
                        <Text as="span" variant="bodyMd">
                          <strong>Enable 3D Product Viewer:</strong> Enable the Storefront integration to start. Embed the 3D Product Viewer by clicking the button below or navigating to Online Store &gt; Themes &gt; Customize &gt; App Embeds, and save your settings after enabling the app block.
                        </Text>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Button
                            onClick={miHandleRedirect}
                            variant="primary"
                            disabled={!miCreatedAccount || miIsLoading}
                          >
                            Enable theme block
                          </Button>
                        </div>
                      </List.Item>
                      <br></br>
                      <List.Item>
                        <Text as="span" variant="bodyMd">
                          <strong>Configure 3D Viewer Settings:</strong>{" "}
                          Set your preferred configuration on the Configuration page, such as model display settings, viewer dimensions, and interaction options.
                        </Text>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Button
                            onClick={() => miNavigate("/app/3dproductview-config-settings")}
                            variant="primary"
                            disabled={miIsLoading}
                          >
                            Go to Configuration
                          </Button>
                        </div>
                      </List.Item>
                      <br></br>
                      <List.Item>
                        <Text as="span" variant="bodyMd">
                          <strong>Setup Products:</strong> Choose products for which you want to add 3D image and upload images there on the Choose Products page.
                        </Text>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Button
                            onClick={() => miNavigate("/app/chooseproducts")}
                            variant="primary"
                            disabled={miIsLoading}
                          >
                            Choose Products
                          </Button>
                        </div>
                      </List.Item>
                      <br></br>
                      <List.Item>
                        <Text as="span" variant="bodyMd">
                          <strong>Upload CSV:</strong> Upload 3D model image files in bulk using a CSV file formatted according to the provided sample CSV.
                          <br></br>
                          <strong>Upload Zip Files:</strong> First, upload ZIP files containing <code>.glb</code> or <code>.gltf</code> files, then reference the ZIP file name in the <code>path</code> column of your CSV file.

                        </Text>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Button
                            onClick={() => miNavigate("/app/bulk-upload")}
                            variant="primary"
                            disabled={miIsLoading}
                          >
                            Upload CSV
                          </Button>
                        </div>
                      </List.Item>
                    </List>
                  </div>
                )}
              </Card>
            </Layout.Section>
          )}

          <Layout.Section>
            <Card>
              <div
                onClick={() => miSetIsAccountOpen(!miIsAccountOpen)}
                style={{
                  cursor: "pointer",
                  padding: "1rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#f5f5f5",
                  borderRadius: "5px",
                }}
              >
                <Text as="h2" variant="headingMd">
                  Account
                </Text>
                <SettingOutlined style={{ fontSize: "20px", color: "#555" }} />
              </div>
              {miIsAccountOpen && (
                <div style={{ marginTop: "1rem", padding: "1rem" }}>
                  {miCreatedAccount ? (
                    <BlockStack gap="200">
                      <Text as="h4" variant="headingSm">
                        Account Details
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <strong>Username:</strong> {miCreatedAccount.username}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <strong>Email:</strong> {miCreatedAccount.email}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <strong>Serial Key:</strong> {miCreatedAccount.serialkey}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <strong>Shop:</strong> {miCreatedAccount.shop}
                      </Text>
                    </BlockStack>
                  ) : (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Add Account Details
                      </Text>
                      <Form method="post">
                        <input type="hidden" name="shop" value={shop} />
                        <div style={{ marginBottom: "1rem" }}>
                          <label
                            htmlFor="username"
                            style={{ display: "block", marginBottom: "0.5rem" }}
                          >
                            Username
                          </label>
                          <input
                            id="username"
                            type="text"
                            name="username"
                            placeholder="Username"
                            required
                            value={miAccount.username}
                            onChange={(e) =>
                              miSetAccount({ ...miAccount, username: e.target.value })
                            }
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: "5px",
                              border: "1px solid #ddd",
                            }}
                          />
                        </div>

                        <div style={{ marginBottom: "1rem" }}>
                          <label
                            htmlFor="email"
                            style={{ display: "block", marginBottom: "0.5rem" }}
                          >
                            Email
                          </label>
                          <input
                            id="email"
                            type="email"
                            name="email"
                            placeholder="Email"
                            required
                            value={miAccount.email}
                            onChange={(e) => miHandleEmailChange(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "10px",
                              borderRadius: "5px",
                              border: `1px solid ${miEmailError ? "#ff0000" : "#ddd"}`,
                            }}
                          />
                          {miEmailError && (
                            <Text
                              as="p"
                              tone="critical"
                              style={{ marginTop: "0.5rem" }}
                            >
                              {miEmailError}
                            </Text>
                          )}
                        </div>

                        {miActionData?.error && (
                          <Text
                            as="p"
                            tone="critical"
                            style={{ marginBottom: "1rem" }}
                          >
                            {miActionData.error}
                          </Text>
                        )}

                        <Button
                          variant="primary"
                          submit
                          disabled={
                            !miAccount.username ||
                            !miAccount.email ||
                            miEmailError ||
                            miIsLoading
                          }
                          loading={miIsLoading}
                        >
                          Save Account
                        </Button>
                      </Form>
                    </BlockStack>
                  )}
                </div>
              )}
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Text as="h2" variant="headingMd">
                Configuration
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Go to Configuration Page
              </Text>
              <div style={{ marginTop: "1rem" }}>
                <Button
                  onClick={() => miNavigate("/app/3dproductview-config-settings")}
                  variant="primary"
                  disabled={miIsLoading}
                  loading={miIsLoading}
                >
                  Configuration
                </Button>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <Text as="h3" variant="headingSm">
                Quick Actions
              </Text>
              <div style={{ marginTop: "1rem" }}>
                <Button
                  variant="secondary"
                  onClick={() => miNavigate("/app/settings")}
                  disabled={miIsLoading}
                  loading={miIsLoading}
                >
                  Settings
                </Button>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
      {miIsLoading && <miFullScreenLoader />}
    </Page>
  );
}