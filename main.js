import express from "express";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import cors from "cors";

// 创建一个 express 服务器实例
const server = express();
server.listen(8800);
console.log("HTTP Server started.");
server.use(cors());
server.use(express.json());

// 使 storage 目录下的文件可以被访问，设置静态文件服务
server.use('/storage', express.static('storage', {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// 视频转码函数
async function transcodeVideo(sourcePath, outputDirectory) {
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .addOption("-hls_time", 5)
      .addOption("-hls_segment_type", "mpegts")
      .addOption("-hls_list_size", 0)
      .addOption("-max_muxing_queue_size", 1024)
      .format("hls")
      .output(`${outputDirectory}/video.m3u8`)
      .on("end", resolve)
      .on("error", reject)
      .run();
  });
}

// 初始化默认视频转码
async function initDefaultVideo() {
  const videoPath = "./video/default.mp4";
  const storageDirectory = path.resolve("storage", "default");

  try {
    if (!fs.existsSync(storageDirectory)) {
      fs.mkdirSync(storageDirectory, { recursive: true });
    }
    await transcodeVideo(videoPath, storageDirectory);
    console.log("Default video transcoded and ready at:", `http://localhost:8800/storage/default/video.m3u8`);
  } catch (error) {
    console.error("Transcode Error for default video:", error);
  }
}

// 路由处理逻辑，从 ./video/response.mp4 获取视频进行转码
async function processVideo(res) {
  const videoPath = "./video/response.mp4";
  const storageDirectory = path.resolve("storage", "responses"); // 使用固定的目录
  
  try {
    // 检查并创建存储目录
    if (!fs.existsSync(storageDirectory)) {
      fs.mkdirSync(storageDirectory, { recursive: true });
    }

    // 转码后的视频将保存到 "responses" 目录中，文件名为 "video.m3u8"
    await transcodeVideo(videoPath, storageDirectory);
    const videoUrl = `http://localhost:8800/storage/responses/video.m3u8`; // 使用固定的 URL
    
    if (res) {
      res.json(videoUrl);
    }
  } catch (error) {
    console.error("Transcode Error:", error);
    if (res && !res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}

// 监听 ./video/response.mp4 文件的变化
fs.watchFile("./video/response.mp4", { interval: 1000 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log("Video file changed, reprocessing...");
    processVideo();
  }
});

// 服务器启动时处理默认视频
initDefaultVideo();

server.get("/process-video", (req, res) => {
  processVideo(res);
});
console.log("Video Ready");
