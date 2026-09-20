import type { ComponentProps } from 'react';
import { BuildRadiusLayer } from './BuildRadiusLayer';
import { IndustrialMapLayer as IndustrialMapLayerCore } from './IndustrialMapLayerCore';

type Props = ComponentProps<typeof IndustrialMapLayerCore>;

export function IndustrialMapLayer(props: Props) {
  return (
    <>
      <BuildRadiusLayer selectedH3={props.selectedH3} />
      <IndustrialMapLayerCore {...props} />
    </>
  );
}
