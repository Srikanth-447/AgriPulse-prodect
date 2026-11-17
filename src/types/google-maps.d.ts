declare namespace google {
  namespace maps {
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    interface LatLng {
      lat: () => number;
      lng: () => number;
    }

    interface LatLngBounds {
      extend: (latLng: LatLngLiteral) => void;
    }

    interface Polyline {
      setMap: (map: unknown) => void;
      setOptions: (opts: { strokeColor?: string; strokeWeight?: number; strokeOpacity?: number }) => void;
    }

    namespace places {
      class AutocompleteSessionToken {}

      interface PlacePrediction {
        text: { text: string };
        toPlace: () => Place;
      }

      interface AutocompleteSuggestion {
        placePrediction?: PlacePrediction;
      }

      interface Place {
        location?: LatLng | null;
        displayName?: string | null;
        formattedAddress?: string | null;
        fetchFields: (opts: { fields: string[] }) => Promise<void>;
      }

      const AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: (req: {
          input: string;
          includedRegionCodes?: string[];
          sessionToken?: AutocompleteSessionToken;
        }) => Promise<{ suggestions: AutocompleteSuggestion[] }>;
      };
    }
  }
}
