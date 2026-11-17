import React, { createContext, useContext, useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

interface MapsConfigContextValue {
  apiKey: string;
  isReady: boolean;
  hasKey: boolean;
}

const MapsConfigContext = createContext<MapsConfigContextValue>({
  apiKey: '',
  isReady: false,
  hasKey: false,
});

export function useMapsConfig(): MapsConfigContextValue {
  return useContext(MapsConfigContext);
}

export function MapsWrapper({ children }: { children: React.ReactNode }) {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
  const [apiKey, setApiKey] = useState<string>(envKey);
  const [isReady, setIsReady] = useState<boolean>(Boolean(envKey));

  useEffect(() => {
    if (envKey) return;
    let active = true;
    fetch('/api/config')
      .then((res) => res.json())
      .then((data: { mapsApiKey?: string }) => {
        if (!active) return;
        if (data.mapsApiKey) {
          setApiKey(data.mapsApiKey);
        }
        setIsReady(true);
      })
      .catch(() => {
        if (active) setIsReady(true);
      });
    return () => {
      active = false;
    };
  }, [envKey]);

  const value: MapsConfigContextValue = {
    apiKey,
    isReady,
    hasKey: Boolean(apiKey),
  };

  if (!isReady) {
    return <MapsConfigContext.Provider value={value}>{children}</MapsConfigContext.Provider>;
  }

  if (!apiKey) {
    return <MapsConfigContext.Provider value={value}>{children}</MapsConfigContext.Provider>;
  }

  return (
    <MapsConfigContext.Provider value={value}>
      <APIProvider
        apiKey={apiKey}
        language="en"
        region="IN"
        libraries={['places', 'routes', 'marker']}
      >
        {children}
      </APIProvider>
    </MapsConfigContext.Provider>
  );
}
