import React from 'react';
import Svg, { Path } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const LearningThinIcon = ({
  size = 28,
  color = '#494C4E',
  strokeWidth = 2,
}: Props) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
    >
      <Path
        d="M1 2h16v11H1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 5.5v5s3-1 5 0v-5s-2-2-5 0zM9 5.5v5s3-1 5 0v-5s-2-2-5 0z"
        stroke={color}
        strokeWidth={strokeWidth - 1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8.5 14l-3 3h7l-3-3z"
        fill={color}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export default LearningThinIcon;
