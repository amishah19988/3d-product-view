import { json } from '@remix-run/node';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import { AppProvider, Frame, Page, Card, Text, Button, Toast, Loading, FormLayout } from '@shopify/polaris';
import { useState, useEffect, useRef } from 'react';
import enTranslations from '@shopify/polaris/locales/en.json';
import { promises as fs } from 'fs';
import path from 'path';

function miGenerateUniqueFileName(miOriginalName) {
  const miTimestamp = Date.now();
  const miExtension = miOriginalName.split('.').pop();
  return `${miTimestamp}-${miOriginalName.replace(`.${miExtension}`, '')}.${miExtension}`;
}

export async function action({ request }) {
  try {
    const miFormData = await request.formData();
    const miZipFile = miFormData.get('zipFile');

    if (!miZipFile || miZipFile.size === 0) {
      return json({ success: false, error: 'Please upload a zip file.' }, { status: 400 });
    }

    const miFileName = miZipFile.name.toLowerCase();
    if (!miFileName.endsWith('.zip')) {
      return json({ success: false, error: 'Please upload a .zip file.' }, { status: 400 });
    }

    const miUniqueFileName = miGenerateUniqueFileName(miZipFile.name);
    let miFileBuffer;
    try {
      const miArrayBuffer = await miZipFile.arrayBuffer();
      miFileBuffer = Buffer.from(miArrayBuffer);
    } catch (miBufferError) {
      console.error('Error reading file buffer:', miBufferError);
      return json({ success: false, error: 'Failed to read the file.' }, { status: 400 });
    }

    const miUploadDir = path.join(process.cwd(), 'Uploads');
    try {
      await fs.mkdir(miUploadDir, { recursive: true });
    } catch (miMkdirError) {
      console.error('Error creating uploads directory:', miMkdirError);
      return json(
        { success: false, error: 'Failed to create upload directory.' },
        { status: 500 }
      );
    }

    const miFilePath = path.join(miUploadDir, miUniqueFileName);
    try {
      await fs.writeFile(miFilePath, miFileBuffer);
    } catch (miWriteError) {
      console.error('Error writing file to disk:', miWriteError);
      return json(
        { success: false, error: 'Failed to save the file to the server.' },
        { status: 500 }
      );
    }

    return json({ success: true, message: 'Zip file uploaded successfully.', filePath: miFilePath });
  } catch (error) {
    console.error('Error in action:', {
      error: error,
      message: error?.message || 'No message available',
      stack: error?.stack || 'No stack available',
      stringified: JSON.stringify(error, null, 2),
    });
    const miErrorMessage = error?.message || 'An unknown error occurred during file upload.';
    return json({ success: false, error: miErrorMessage }, { status: 500 });
  }
}

const UploadZipPage = () => {
  const miActionData = useActionData();
  const miNavigation = useNavigation();
  const [miShowToast, setMiShowToast] = useState(false);
  const [miToastMessage, setMiToastMessage] = useState('');
  const [miToastError, setMiToastError] = useState(false);
  const [miUploadedFilePath, setMiUploadedFilePath] = useState(null);
  const miFormRef = useRef(null);
  const miFileInputRef = useRef(null);

  useEffect(() => {
    if (miActionData && miNavigation.state === 'idle') {
      if (miActionData.success) {
        setMiToastMessage(miActionData.message);
        setMiToastError(false);
        setMiShowToast(true);
        setMiUploadedFilePath(miActionData.filePath);
        if (miFileInputRef.current) {
          miFileInputRef.current.value = '';
        }
        if (miFormRef.current) {
          miFormRef.current.reset();
        }
      } else if (miActionData.error) {
        setMiToastMessage(miActionData.error);
        setMiToastError(true);
        setMiShowToast(true);
      }
    }
  }, [miActionData, miNavigation.state]);

  const miToastMarkup = miShowToast ? (
    <Toast
      content={miToastMessage}
      error={miToastError}
      onDismiss={() => setMiShowToast(false)}
    />
  ) : null;

  return (
    <AppProvider i18n={enTranslations}>
      <Frame contextualSaveBar={null}>
        {miNavigation.state === 'submitting' && <Loading />}
        {miToastMarkup}
        <Page title="Upload Zip Files">
          <Card>
            <Text variant="headingMd" as="h2">
              Upload Zip File
            </Text>
            <Form
              method="post"
              encType="multipart/form-data"
              ref={miFormRef}
            >
              <FormLayout>
                <div style={{ marginTop: '20px' }}>
                  <label htmlFor="zipFile">
                    Upload zip file here <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="file"
                    id="zipFile"
                    name="zipFile"
                    accept=".zip"
                    style={{ display: 'block', marginTop: '8px' }}
                    ref={miFileInputRef}
                  />
                </div>
                <Text as="p" tone="subdued" style={{ marginTop: '8px' }}>
                  Upload a zip file containing 3D model files (.gltf or .glb).
                </Text>
                <div style={{ marginTop: '20px' }}>
                  <Button
                    primary
                    submit
                    loading={miNavigation.state === 'submitting'}
                    disabled={miNavigation.state === 'submitting'}
                  >
                    {miNavigation.state === 'submitting' ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </FormLayout>
            </Form>
            {miUploadedFilePath && (
              <div style={{ marginTop: '20px' }}>
                <Text variant="bodyMd" as="p">
                  Uploaded file saved at: <code>{miUploadedFilePath}</code>
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  This file is stored on the server. You can access it in the <code>Uploads/</code> directory.
                </Text>
              </div>
            )}
          </Card>
        </Page>
      </Frame>
    </AppProvider>
  );
};

export default UploadZipPage;