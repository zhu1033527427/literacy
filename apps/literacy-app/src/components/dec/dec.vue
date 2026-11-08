<template>
	<!-- 卡通背景装饰 -->
	<text class="deco deco-cloud-a">☁️</text>
	<text class="deco deco-cloud-b">☁️</text>
	<text class="deco deco-star-a">⭐</text>
	<text class="deco deco-star-b">✨</text>
	<text class="deco deco-balloon">🎈</text>

	<!-- 头部 -->
	<view class="header">
		<text class="title">📚 拍拍识字</text>
		<text class="subtitle">让我们开始拍拍识字之旅吧～</text>
	</view>
</template>
<style>
	.bg-image {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: -1;
	}

	/* ===== 卡通装饰 ===== */
	.deco {
		position: absolute;
		z-index: 1;
	}

	.deco-cloud-a {
		top: 30rpx;
		left: 30rpx;
		font-size: 44rpx;
	}

	.deco-cloud-b {
		top: 84rpx;
		right: 44rpx;
		font-size: 34rpx;
	}

	.deco-star-a {
		top: 28rpx;
		right: 150rpx;
		font-size: 30rpx;
	}

	.deco-star-b {
		top: 116rpx;
		left: 130rpx;
		font-size: 26rpx;
	}

	.deco-balloon {
		top: 56rpx;
		right: 16rpx;
		font-size: 40rpx;
	}

	/* ===== 头部 ===== */
	.header {
		padding: 150rpx 40rpx 80rpx;
		align-items: center;
		background-color: rgba(255, 255, 255, 0.4)
	}

	.title {
		font-size: 52rpx;
		font-weight: bold;
		color: #FF6B81;
	}

	.subtitle {
		font-size: 26rpx;
		color: #B08850;
		margin-top: 12rpx;
	}
</style>