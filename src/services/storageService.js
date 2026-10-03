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

/**
 * يضغط صورة أو ملف صورة أو رابط Data URL تكرارياً لضمان عدم تجاوز حجم Base64 الحد الآمن لقواعد بيانات فايربيس (< 650,000 حرف)
 * @param {File|Blob|string} fileOrDataUrl
 * @param {number} maxCharacters الحد الأقصى لعدد حروف Base64 (افتراضياً 650,000 حرف ~ 635KB)
 * @returns {Promise<string>} رابط Data URL مضغوط وآمن
 */
export function compressImageToSafeDataUrl(fileOrDataUrl, maxCharacters = 650000) {
  return new Promise((resolve, reject) => {
    if (!fileOrDataUrl) return resolve(null);

    const loadImage = (src) => {
      return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => res(img);
        img.onerror = (e) => rej(new Error('فشل تحميل الصورة للضغط'));
        img.src = src;
      });
    };

    const processSrc = async (src) => {
      try {
        if (typeof src === 'string' && src.startsWith('data:image/') && src.length <= maxCharacters) {
          return resolve(src);
        }

        const img = await loadImage(src);
        let curWidth = img.width || 1200;
        let curHeight = img.height || 1200;

        // وضع حد أقصى مبدئي للأبعاد (1200 بكسل كافية جداً لقراءة الفواتير بوضوح فائق)
        const MAX_INIT = 1200;
        if (curWidth > MAX_INIT || curHeight > MAX_INIT) {
          if (curWidth > curHeight) {
            curHeight = Math.round((curHeight * MAX_INIT) / curWidth);
            curWidth = MAX_INIT;
          } else {
            curWidth = Math.round((curWidth * MAX_INIT) / curHeight);
            curHeight = MAX_INIT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = curWidth;
        canvas.height = curHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(src);
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, curWidth, curHeight);
        ctx.drawImage(img, 0, 0, curWidth, curHeight);

        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // حلقة تكرارية لتقليل الحجم تدريجياً إذا لزم الأمر حتى يقل الحجم عن الحد الآمن
        let iterations = 0;
        while (dataUrl.length > maxCharacters && iterations < 8) {
          iterations++;
          if (quality > 0.45) {
            quality -= 0.12;
          } else {
            // تصغير أبعاد الكانفاس بنسبة 20%
            curWidth = Math.max(300, Math.round(curWidth * 0.8));
            curHeight = Math.max(300, Math.round(curHeight * 0.8));
            canvas.width = curWidth;
            canvas.height = curHeight;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            quality = 0.55;
          }
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      } catch (err) {
        console.error('Error compressing image:', err);
        if (typeof src === 'string' && src.length <= maxCharacters) {
          resolve(src);
        } else {
          reject(err);
        }
      }
    };

    if (typeof fileOrDataUrl === 'string') {
      processSrc(fileOrDataUrl);
    } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => processSrc(e.target.result);
      reader.onerror = (e) => reject(new Error('فشل قراءة ملف الصورة من جهازك'));
      reader.readAsDataURL(fileOrDataUrl);
    } else {
      resolve(null);
    }
  });
}

