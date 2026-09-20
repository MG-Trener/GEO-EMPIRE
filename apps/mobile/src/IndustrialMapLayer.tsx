import type { ComponentProps } from 'react';
import { BuildRadiusLayer } from './BuildRadiusLayer';
import { IndustrialMapLayer as IndustrialMapLayerCore } from './IndustrialMapLayerCore';
import { useNavigationTarget } from './navigationTarget';

type Props = ComponentProps<typeof IndustrialMapLayerCore>;

export function IndustrialMapLayer(props: Props) {
  const navigationTarget = useNavigationTarget();

  return (
    <>
      <BuildRadiusLayer
        selectedH3={props.selectedH3}
        navigationTarget={navigationTarget}
        onTargetPress={(h3Index) => props.onSelect?.(h3Index)}
      />
      <IndustrialMapLayerCore {...props} />
    </>
  );
}
