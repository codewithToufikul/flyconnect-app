import storage from '@react-native-firebase/storage';
import ImagePicker from 'react-native-image-crop-picker';
import ImageResizer from 'react-native-image-resizer';
import {createThumbnail} from 'react-native-create-thumbnail';
import DocumentPicker, {
  DocumentPickerResponse,
  types,
} from 'react-native-document-picker';
import RNBlobUtil from 'react-native-blob-util';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaUploadResult {
  url: string;
  thumbnailUrl?: string;
  localUri?: string;
  thumbnailUri?: string;
  fileName: string;
  fileSize: number;
  contentType: 'image' | 'video' | 'file' | 'audio';
  mimeType?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

export interface PickedMedia {
  localUri: string;
  thumbnailUri?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  type: 'image' | 'video' | 'file' | 'audio';
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safer way to strip file:// prefix.
 */
const stripFileProtocol = (uri: string | undefined | null): string => {
  if (!uri) return '';
  return uri.replace(/^file:\/\//, '');
};

const buildStoragePath = (
  type: 'image' | 'video' | 'file' | 'audio',
  name: string,
) => {
  const folder =
    type === 'image'
      ? 'chat/images'
      : type === 'video'
      ? 'chat/videos'
      : type === 'audio'
      ? 'chat/audio'
      : 'chat/files';
  return `${folder}/${Date.now()}-${name}`;
};

// ─── MediaService ─────────────────────────────────────────────────────────────

class MediaService {
  // ── Pick image ───────────────────────────────────────────────────────────────

  async pickImage(): Promise<PickedMedia | null> {
    try {
      const image = await ImagePicker.openPicker({
        mediaType: 'photo',
        compressImageQuality: 0.7,
        compressImageMaxWidth: 1200,
        compressImageMaxHeight: 1200,
      });

      const resized = await ImageResizer.createResizedImage(
        image.path,
        1024,
        1024,
        'JPEG',
        70,
        0,
        undefined,
        false,
        {mode: 'contain', onlyScaleDown: true},
      );

      return {
        localUri: resized.uri,
        fileName: image.filename || `image_${Date.now()}.jpg`,
        fileSize: resized.size ?? 0,
        mimeType: 'image/jpeg',
        type: 'image',
        metadata: {width: resized.width, height: resized.height},
      };
    } catch (err) {
      console.error('pickImage error:', err);
      return null;
    }
  }

  // ── Pick video ───────────────────────────────────────────────────────────────

  async pickVideo(): Promise<PickedMedia | null> {
    try {
      const video = await ImagePicker.openPicker({mediaType: 'video'});

      let thumbnailUri: string | undefined;
      try {
        const thumb = await createThumbnail({url: video.path, timeStamp: 1000});
        thumbnailUri = thumb.path;
      } catch (e) {
        console.warn('Thumbnail generation failed:', e);
      }

      return {
        localUri: video.path,
        thumbnailUri,
        fileName: video.filename || `video_${Date.now()}.mp4`,
        fileSize: video.size ?? 0,
        mimeType: video.mime || 'video/mp4',
        type: 'video',
        metadata: {
          width: video.width ?? undefined,
          height: video.height ?? undefined,
          duration: video.duration ? video.duration / 1000 : undefined,
        },
      };
    } catch (err) {
      console.error('pickVideo error:', err);
      return null;
    }
  }

  // ── Pick file ────────────────────────────────────────────────────────────────
  /**
   * We use copyTo: 'cachesDirectory' which is the built-in way in
   * react-native-document-picker to handle Android's content:// permission issues.
   */
  async pickFile(): Promise<PickedMedia | null> {
    try {
      const result: DocumentPickerResponse[] = await DocumentPicker.pick({
        type: [
          types.pdf,
          types.doc,
          types.docx,
          types.xls,
          types.xlsx,
          types.ppt,
          types.pptx,
          types.plainText,
          types.zip,
          types.csv,
        ],
        allowMultiSelection: false,
        copyTo: 'cachesDirectory', // <--- Automatically handles content:// URIs
      });

      const file = result[0];
      if (!file || !file.fileCopyUri) return null;

      //FileCopyUri is a file:// path which Firebase can read
      const localUri = file.fileCopyUri;
      const fileName = file.name || `file_${Date.now()}`;
      const fileSize = file.size || 0;
      const mimeType = file.type || 'application/octet-stream';

      console.log(`✅ File picked and cached by picker: ${localUri}`);

      return {
        localUri,
        fileName,
        fileSize,
        mimeType,
        type: 'file',
      };
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('pickFile error:', err);
      }
      return null;
    }
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  async uploadMedia(
    picked: PickedMedia,
    onProgress: (percent: number) => void,
  ): Promise<MediaUploadResult> {
    const path = buildStoragePath(picked.type, picked.fileName);
    const ref = storage().ref(path);
    const localPath = stripFileProtocol(picked.localUri);

    if (!localPath) {
      throw new Error('Local path is empty');
    }

    console.log(`📤 Uploading [${picked.type}] from: ${localPath}`);

    const mainMax = picked.type === 'video' && picked.thumbnailUri ? 90 : 100;

    // Explicitly handle the task to avoid race conditions in some library versions
    const uploadTask = ref.putFile(localPath, {contentType: picked.mimeType});

    uploadTask.on('state_changed', snap => {
      if (snap.totalBytes > 0) {
        onProgress(
          Math.round((snap.bytesTransferred / snap.totalBytes) * mainMax),
        );
      }
    });

    try {
      await uploadTask;
    } catch (error: any) {
      console.error('Firebase putFile failed:', error);
      throw error;
    }

    const url = await ref.getDownloadURL();
    console.log('✅ Main file uploaded:', url);

    // Upload video thumbnail
    let thumbnailUrl: string | undefined;
    if (picked.type === 'video' && picked.thumbnailUri) {
      try {
        const thumbPath = `chat/thumbnails/${Date.now()}-thumb.jpg`;
        const thumbRef = storage().ref(thumbPath);
        const thumbLocalPath = stripFileProtocol(picked.thumbnailUri);

        const thumbTask = thumbRef.putFile(thumbLocalPath, {
          contentType: 'image/jpeg',
        });
        await thumbTask;

        thumbnailUrl = await thumbRef.getDownloadURL();
        console.log('✅ Thumbnail uploaded:', thumbnailUrl);
        onProgress(100);
      } catch (e) {
        console.warn('Thumbnail upload failed (non-fatal):', e);
        onProgress(100);
      }
    }

    // Clean up cache for 'file' type since it was copied by picker
    if (picked.type === 'file') {
      try {
        await RNBlobUtil.fs.unlink(localPath);
        console.log('🗑️  Cache file cleaned up');
      } catch (e) {
        console.warn('Cache cleanup failed:', e);
      }
    }

    return {
      url,
      thumbnailUrl,
      localUri: picked.localUri,
      thumbnailUri: picked.thumbnailUri,
      fileName: picked.fileName,
      fileSize: picked.fileSize,
      contentType: picked.type,
      mimeType: picked.mimeType,
      metadata: picked.metadata,
    };
  }
}

export default new MediaService();
