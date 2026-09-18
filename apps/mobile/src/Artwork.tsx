import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  uri?: string;
  label: string;
  size?: number;
  radius?: number;
};

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Artwork({ uri, label, size = 48, radius = 10 }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const frameStyle = {
    width: size,
    height: size,
    borderRadius: radius,
  };

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, frameStyle]} accessibilityLabel={label}>
        <Text style={styles.fallbackText}>{initials(label) || 'GE'}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      onError={() => setFailed(true)}
      resizeMode="contain"
      style={[styles.image, frameStyle]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,196,81,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,196,81,0.18)',
  },
  fallbackText: {
    color: '#c9a956',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
