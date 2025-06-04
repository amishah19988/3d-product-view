import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
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
import { json, redirect } from "@remix-run/node";
import NavigationBar from './NavigationBar';

const MiFullScreenLoader = () => (
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
  const miIsLoading =
    ["loading", "submitting"].includes(miFetcher.state) ||
    ["loading", "submitting"].includes(miNavigation.state);

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

  return (
    <Page>
      <TitleBar title="3D Product Viewer" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <NavigationBar />
            <div
              style={{
                backgroundImage: "url('/banner_image.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
                height: "200px",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                textAlign: "center",
                padding: "1rem",
                marginBottom: "1rem",
              }}
            />
            {!miCreatedAccount ? (
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    No Account Found
                  </Text>
                  <Text as="p" tone="subdued">
                    Create an account to start configuring the 3D Product Viewer.
                  </Text>
                  <div style={saveButtonStyle}>
                    <Button
                      variant="primary"
                      size="slim"
                      onClick={() => miNavigate("/app/settings")}
                      disabled={miIsLoading}
                      style={{ backgroundColor: '#000000', color: '#FFFFFF' }}
                    >
                      <div style={buttonContentStyle}>
                        <span>Create Account</span>
                        <img
                          src="/arrow-right.svg"
                          alt="Arrow Right"
                          style={{ width: "16px", height: "16px" }}
                        />
                      </div>
                    </Button>
                  </div>
                </BlockStack>
              </Card>
            ) : (
              <>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <img src="/guide.svg" alt="Guide" style={{ width: "40px", height: "40px" }} />
                      <Text as="h2" variant="headingMd">
                        Setup Guide: Get Started with 3D Product Viewer
                      </Text>
                    </div>
                    <button
                      className="Polaris-Button Polaris-Button--pressable Polaris-Button--variantSecondary Polaris-Button--sizeMedium Polaris-Button--textAlignCenter"
                      type="button"
                      onClick={() => miSetIsGuideOpen(!miIsGuideOpen)}
                    >
                      <span className="Polaris-Text--root Polaris-Text--bodySm Polaris-Text--medium">
                        <span className="Polaris-Icon">
                          <svg
                            viewBox="0 0 20 20"
                            className="Polaris-Icon__Svg"
                            focusable="false"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M5.72 8.47a.75.75 0 0 1 1.06 0l3.47 3.47 3.47-3.47a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06Z"
                            />
                          </svg>
                        </span>
                      </span>
                    </button>
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
                        <List.Item>
                          <Text as="span" variant="bodyMd">
                            <strong>Configure 3D Viewer Settings:</strong> Set your preferred configuration on the Configuration page, such as model display settings, viewer dimensions, and interaction options.
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
                        <List.Item>
                          <Text as="span" variant="bodyMd">
                            <strong>Setup Products:</strong> Choose products for which you want to add 3D images on the Choose Products page.
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
                        <List.Item>
                          <Text as="span" variant="bodyMd">
                            <strong>Upload CSV:</strong> Upload 3D model image files in bulk using a CSV file formatted according to the provided sample CSV. First, upload ZIP files containing <code>.glb</code> or <code>.gltf</code> files, then reference the ZIP file name in the <code>path</code> column of your CSV file.
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

                <Card>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "1rem",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ width: "160px" }}>
                      <Button
                        variant="primary"
                        size="slim"
                        onClick={() => miNavigate("/app/settings")}
                        disabled={miIsLoading}
                        fullWidth
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            padding: "5px",
                          }}
                        >
                          <span>View Account</span>
                          <img
                            src="/arrow-right.svg"
                            alt="Arrow Right"
                            style={{ width: "16px", height: "16px" }}
                          />
                        </div>
                      </Button>
                    </div>
                    <div style={{ width: "160px" }}>
                      <Button
                        variant="primary"
                        size="slim"
                        onClick={() => miNavigate("/app/chooseproducts")}
                        disabled={miIsLoading}
                        fullWidth
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.5rem",
                            padding: "5px",
                          }}
                        >
                          <span>Choose Products</span>
                          <img
                            src="/arrow-right.svg"
                            alt="Arrow Right"
                            style={{ width: "16px", height: "16px" }}
                          />
                        </div>
                      </Button>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </Layout.Section>
        </Layout>
      </BlockStack>
      {miIsLoading && <MiFullScreenLoader />}
    </Page>
  );
}