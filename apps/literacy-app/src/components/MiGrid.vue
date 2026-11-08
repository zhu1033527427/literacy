<template>
  <view class="grid-box">
    <view class="grid-line line-v"></view>
    <view class="grid-line line-h"></view>
    <view class="grid-line line-d1"></view>
    <view class="grid-line line-d2"></view>
    <text :class="class">{{ props.char }}</text>
    <view>
      <svg width="100" height="100" viewBox="0 0 24 24">
        <path d="M9 6L15 12L9 18" stroke="#000" fill="none" />
      </svg>
    </view>

    <!-- <svg width="1000" height="1000" view-box="0 0 1000 1000">
      <path
        v-for="(stroke, i) in props.strokeData.strokes"
        :d="stroke"
        :key="i"
      ></path>
    </svg> -->
  </view>
</template>

<script setup lang="ts">
import { StrokeData } from '@literacy/shared-types';
const props = defineProps<{
  char: string;
  class: string;
  strokeData: StrokeData;
}>();
</script>

<style>
.grid-box {
  width: 560rpx;
  height: 560rpx;
  background-color: #fbfdf7;
  border-width: 4rpx;
  border-style: solid;
  border-color: #b9d6bc;
  border-radius: 18rpx;
  margin-top: 18rpx;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10rpx 26rpx rgba(86, 130, 96, 0.12);
  position: relative;
}

.grid-line {
  position: absolute;
  background-color: #afccb2;
  opacity: 0.55;
}

.line-v {
  left: 50%;
  top: 6rpx;
  width: 2rpx;
  height: 548rpx;
  margin-left: -1rpx;
}

.line-h {
  top: 50%;
  left: 6rpx;
  height: 2rpx;
  width: 548rpx;
  margin-top: -1rpx;
}

.line-d1 {
  top: 50%;
  left: 50%;
  width: 740rpx;
  height: 2rpx;
  margin-left: -370rpx;
  margin-top: -1rpx;
  transform: rotate(45deg);
}

.line-d2 {
  top: 50%;
  left: 50%;
  width: 740rpx;
  height: 2rpx;
  margin-left: -370rpx;
  margin-top: -1rpx;
  transform: rotate(-45deg);
}
</style>
