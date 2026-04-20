import { cloudinaryConfig } from '../config/firebaseConfig';

/** Upload video or image to Cloudinary; returns secure URL. */
export async function uploadFileToCloudinary(
  fileUri: string,
  fileType: 'image' | 'video',
  fileName: string,
  mimeType?: string
): Promise<string> {
  const resourceType = fileType === 'video' ? 'video' : 'image';
  const publicId = `${fileType}_${Date.now()}_${(fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const formData = new FormData();
  const imageMime =
    fileType === 'image' && mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  (formData as any).append('file', {
    uri: fileUri,
    name: fileName || (fileType === 'video' ? 'video.mp4' : 'image.jpg'),
    type: fileType === 'video' ? 'video/mp4' : imageMime,
  });
  formData.append('upload_preset', cloudinaryConfig.uploadPreset);
  formData.append('public_id', publicId);
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`;
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload ${fileType}`);
  }
  const data = await res.json();
  return data.secure_url;
}
