/**
 * يقرأ ملف الصورة، يقلل حجمه، ويحوله إلى نص (Base64 Data URL).
 * يتم حفظ هذا النص مباشرة في قاعدة بيانات Firebase داخل بيانات المنتج.
 * هذه الطريقة تلغي الحاجة لأي خدمات رفع خارجية (ImgBB أو Firebase Storage) وتحل جميع مشاكل الدفع.
 * @param {File} file - ملف الصورة
 * @returns {Promise<string>} نص الصورة بصيغة Base64
 */
export function uploadProductImage(file, preserveTransparency = false) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('لم يتم تحديد ملف'));

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // تحديد أقصى حجم للصورة (600 بكسل) للحفاظ على مساحة قاعدة البيانات
        const MAX_SIZE = 600;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        
        if (!preserveTransparency) {
          // ملء الخلفية باللون الأبيض للصور العادية
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }
        
        ctx.drawImage(img, 0, 0, width, height);

        // إذا أردنا الحفاظ على الشفافية نستخدم webp، وإلا jpeg
        const format = preserveTransparency ? 'image/webp' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, 0.7);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('الملف ليس صورة صالحة'));
    };

    reader.onerror = () => reject(new Error('فشل قراءة الملف من جهازك'));
  });
}
