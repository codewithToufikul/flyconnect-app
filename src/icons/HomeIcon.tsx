import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

export default function HomeIcon({ size = 24, color = '#000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
      <Path d="m12 5.432 8.159 8.159v6.284A1.875 1.875 0 0 1 18.375 21H15v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21H5.625A1.875 1.875 0 0 1 3.75 19.125v-6.284L12 5.432Z" />
    </Svg>
  );
}
