<template>
  <!-- 绘本列表 -->
  <view class="section-header">
    <text class="section-title"> 我的物品</text>
    <text class="section-count">{{ materials.length }}样</text>
  </view>

  <view class="grid">
    <view
      class="card"
      v-for="material in materials"
      :key="material.id"
      @click="gotoTask(material.id)"
    >
      <view class="cover" :style="{ backgroundImage: material.id }">
        <image class="cover-image" :src="material.id" />
      </view>
      <view class="info">
        <text class="title">{{ material.title }}</text>
        <view class="meta">
          <text class="char-badge">{{ material.chars.length }} 个生字</text>
          <text class="progress">{{ material.progress }}</text>
        </view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app';
import { ocrState } from '@/stores/ocr';
import { ref } from 'vue';
import { Material } from '@literacy/shared-types';

const materials = ref<Array<Material>>([]);
onShow(() => {
  const data = ocrState.list;
  if (data && data.length > 0) {
    materials.value = data;
  }
});

function gotoTask(id: string) {
  uni.navigateTo({ url: '/pages/literacy/literacy?id=' + id });
}
</script>
<style>
/* ===== 区块标题 ===== */
.section-header {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 36rpx 40rpx 8rpx;
}

.section-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #5b4b8a;
}

.section-count {
  font-size: 22rpx;
  color: #b08850;
  background-color: #ffedd5;
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
}

/* ===== 绘本网格 ===== */
.grid {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  padding: 0 30rpx;
}

.card {
  width: 48%;
  background-color: #ffffff;
  border-radius: 28rpx;
  margin-top: 24rpx;
  overflow: hidden;
  box-shadow: 0 8rpx 20rpx rgba(255, 182, 193, 0.15);
}

.cover {
  height: 210rpx;
  align-items: center;
  justify-content: center;
}

.cover-image {
  width: 100%;
  height: 100%;
}

.info {
  padding: 20rpx;
}

.title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-top: 14rpx;
}

.char-badge {
  font-size: 20rpx;
  color: #ff6b81;
  background-color: #fff0f3;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
}

.progress {
  font-size: 18rpx;
}
</style>
