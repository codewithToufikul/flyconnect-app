import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
};

const ChannelIcon = ({ size = 24, color = '#000' }: Props) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      accessible={false}
    >
      <Path
        fill={color}
        d="M216,64H147.31445l34.34278-34.34277a8.00053,8.00053,0,0,0-11.31446-11.31446L128,60.68652,85.65723,18.34277A8.00053,8.00053,0,0,0,74.34277,29.65723L108.68555,64H40A16.01833,16.01833,0,0,0,24,80V200a16.01833,16.01833,0,0,0,16,16H216a16.01833,16.01833,0,0,0,16-16V80A16.01833,16.01833,0,0,0,216,64Zm0,136H160V80h56l.00977,120Zm-16-36a12,12,0,1,1-12-12A12,12,0,0,1,200,164Zm0-48a12,12,0,1,1-12-12A12,12,0,0,1,200,116Z"
      />
    </Svg>
  );
};

export default ChannelIcon;
