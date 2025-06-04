import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useNavigation } from 'react-router-dom';
import { Button, InlineStack, Spinner } from '@shopify/polaris';

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

const NavigationBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const [isManualLoading, setIsManualLoading] = useState(false);

  const getActiveIcon = () => {
    const path = location.pathname;
    if (path === '/app') return 'home';
    if (path === '/app/3dproductview-config-settings') return 'setting';
    if (path === '/app/chooseproducts') return 'product';
    if (path === '/app/bulk-upload') return 'upload';
    if (path === '/app/settings') return 'account';
    return null;
  };

  const activeIcon = getActiveIcon();

  const isNavigating = navigation.state !== 'idle';

  const handleNavigation = (path) => {
    if (location.pathname !== path) {
      setIsManualLoading(true);
      navigate(path);
    }
  };

  useEffect(() => {
    if (navigation.state === 'idle') {
      setIsManualLoading(false);
    }
  }, [navigation.state, location.pathname]);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '1rem',
          justifyContent: 'space-between',
        }}
      >
        <InlineStack gap="300">
          <Button
            icon={
              <img
                src={activeIcon === 'home' ? '/homedark.svg' : '/home.svg'}
                alt="Home"
                style={{ width: '40px', height: '40px' }}
              />
            }
            onClick={() => handleNavigation('/app')}
            variant="plain"
            accessibilityLabel="Home"
          />
          <Button
            icon={
              <img
                src={activeIcon === 'setting' ? '/settingdark.svg' : '/setting.svg'}
                alt="Configuration"
                style={{ width: '40px', height: '40px' }}
              />
            }
            onClick={() => handleNavigation('/app/3dproductview-config-settings')}
            variant="plain"
            accessibilityLabel="Configuration"
          />
          <Button
            icon={
              <img
                src={activeIcon === 'product' ? '/uploaddark.svg' : '/upload.svg'}
                alt="Choose Products"
                style={{ width: '40px', height: '40px' }}
              />
            }
            onClick={() => handleNavigation('/app/chooseproducts')}
            variant="plain"
            accessibilityLabel="Choose Products"
          />
          <Button
            icon={
              <img
                src={activeIcon === 'upload' ? '/csvdark.svg' : '/csv.svg'}
                alt="Bulk Upload"
                style={{ width: '40px', height: '40px' }}
              />
            }
            onClick={() => handleNavigation('/app/bulk-upload')}
            variant="plain"
            accessibilityLabel="Bulk Upload"
          />
        </InlineStack>
        <Button
          icon={
            <img
              src={activeIcon === 'account' ? '/account.svg' : '/account.svg'}
              alt="Account"
              style={{ width: '40px', height: '40px' }}
            />
          }
          onClick={() => handleNavigation('/app/settings')}
          variant="plain"
          accessibilityLabel="Account"
        />
      </div>
      {(isNavigating || isManualLoading) && <MiFullScreenLoader />}
    </>
  );
};

export default NavigationBar;