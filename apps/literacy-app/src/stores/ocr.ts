import { reactive } from 'vue';
import { Material } from '@literacy/shared-types';

export const ocrState = reactive<{ list: Material[] }>({
  list: [],
});

// 初始化时从本地存储加载
try {
  const saved = uni.getStorageSync('lastOcrResult');
  if (saved) {
    ocrState.list = saved;
  }
} catch (e) {
  console.warn('读取 lastOcrResult 失败', e);
}

export function setOcrResult(data: Material[]) {
  ocrState.list = data;
  try {
    uni.setStorageSync('lastOcrResult', data);
  } catch (e) {
    console.warn('保存 lastOcrResult 失败', e);
  }
}

export function clearOcrResult() {
  const oldList = ocrState.list;
  if (oldList && oldList.length > 0) {
    const fs = uni.getFileSystemManager();
    oldList.forEach((item) => {
      if (item.id && !item.id.startsWith('http')) {
        console.log('准备删除文件:', item.id);

        // 先检查文件是否存在
        try {
          const info = fs.statSync(item.id);

          if (!Array.isArray(info)) {
            // 此处 TypeScript 会将 info 的类型收窄为 Stats
            console.log('文件存在，大小:', info.size);
          } else {
            // 处理数组情况（如果业务上可能出现）
            console.log('这是一个目录递归结果，条目数:', info.length);
          }
        } catch (e) {
          console.log('文件不存在或无法访问:', e);
        }

        // 删除文件
        fs.unlink({
          filePath: item.id,
          success: () => {
            console.log('文件删除成功:', item.id);
          },
          fail: (err) => {
            console.warn('文件删除失败:', item.id, err);
          },
        });
      }
    });
  }

  ocrState.list = [];
  try {
    uni.removeStorageSync('lastOcrResult');
  } catch (e) {
    console.warn('清除 lastOcrResult 失败', e);
  }
}
