import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

const ChannelThinIcon = ({
  size = 28,
  color = '#000',
}: Props) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <Path
        d="M19.2 4.4L2.9 10.7c-1.1.4-1.1 1.1-.2 1.3l4.1 1.3 1.6 4.8c.2.5.1.7.6.7.4 0 .6-.2.8-.4.1-.1 1-1 2-2l4.2 3.1c.8.4 1.3.2 1.5-.7l2.8-13.1c.3-1.1-.4-1.7-1.1-1.3ZM17.1 7.4l-7.8 7.1L9 17.8 7.4 13l9.2-5.8c.4-.3.8-.1.5.2Z"
        fill={color}
      />
      <Rect width="24" height="24" fill="none" />
    </Svg>
  );
};

export default ChannelThinIcon;
