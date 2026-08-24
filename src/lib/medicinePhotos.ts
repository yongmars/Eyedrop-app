const DATABASE_NAME = "eye-drop-local-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "medicinePhotos";

const MAX_IMAGE_DIMENSION = 1280;
const TARGET_IMAGE_BYTES = 600 * 1024;
const INITIAL_JPEG_QUALITY = 0.8;
const MIN_JPEG_QUALITY = 0.6;

export interface MedicinePhotoRecord {
  medicineId: number;
  blob: Blob;
  updatedAt: string;
}

export class MedicinePhotoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MedicinePhotoError";
  }
}

const assertIndexedDBSupport = () => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new MedicinePhotoError("この端末では写真の保存機能を利用できません。");
  }
};

const openDatabase = (): Promise<IDBDatabase> => {
  assertIndexedDBSupport();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "medicineId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(new MedicinePhotoError("写真の保存場所を開けませんでした。", { cause: request.error }));
    };
    request.onblocked = () => {
      reject(new MedicinePhotoError("写真の保存場所がほかの画面で使用中です。画面を閉じて再度お試しください。"));
    };
  });
};

const runRequest = async <T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let requestResult: T;

    request.onsuccess = () => {
      requestResult = request.result;
    };
    request.onerror = () => {
      reject(new MedicinePhotoError("写真データの処理に失敗しました。", { cause: request.error }));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(requestResult);
    };
    transaction.onerror = () => {
      database.close();
      reject(new MedicinePhotoError("写真データの処理に失敗しました。", { cause: transaction.error }));
    };
    transaction.onabort = () => {
      database.close();
      reject(new MedicinePhotoError("写真データの処理が中断されました。", { cause: transaction.error }));
    };
  });
};

export const getMedicinePhoto = async (medicineId: number): Promise<MedicinePhotoRecord | null> => {
  const result = await runRequest<MedicinePhotoRecord | undefined>("readonly", (store) => store.get(medicineId));
  return result ?? null;
};

export const getMedicinePhotos = async (medicineIds: number[]): Promise<Map<number, MedicinePhotoRecord>> => {
  if (medicineIds.length === 0) return new Map();

  const records = await runRequest<MedicinePhotoRecord[]>("readonly", (store) => store.getAll());
  const requestedIds = new Set(medicineIds);
  return new Map(
    records
      .filter((record) => requestedIds.has(record.medicineId))
      .map((record) => [record.medicineId, record])
  );
};

export const getAllMedicinePhotos = async (): Promise<MedicinePhotoRecord[]> =>
  runRequest<MedicinePhotoRecord[]>("readonly", (store) => store.getAll());

export const saveMedicinePhoto = async (
  medicineId: number,
  blob: Blob,
  updatedAt = new Date().toISOString()
): Promise<MedicinePhotoRecord> => {
  const record: MedicinePhotoRecord = { medicineId, blob, updatedAt };
  await runRequest<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
};

export const deleteMedicinePhoto = async (medicineId: number): Promise<void> => {
  await runRequest<undefined>("readwrite", (store) => store.delete(medicineId));
};

export const clearMedicinePhotos = async (): Promise<void> => {
  await runRequest<undefined>("readwrite", (store) => store.clear());
};

export const replaceMedicinePhotos = async (records: MedicinePhotoRecord[]): Promise<void> => {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    records.forEach((record) => store.put(record));

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(new MedicinePhotoError("写真データの一括保存に失敗しました。", { cause: transaction.error }));
    };
    transaction.onabort = () => {
      database.close();
      reject(new MedicinePhotoError("写真データの一括保存が中断されました。", { cause: transaction.error }));
    };
  });
};

const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new MedicinePhotoError("この画像を読み込めませんでした。別の画像をお試しください。"));
    };
    image.src = objectUrl;
  });
};

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new MedicinePhotoError("画像を圧縮できませんでした。別の画像をお試しください。"));
        }
      },
      "image/jpeg",
      quality
    );
  });
};

export const compressMedicinePhoto = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith("image/")) {
    throw new MedicinePhotoError("画像ファイルを選択してください。");
  }

  const image = await loadImage(file);
  const initialScale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
  let quality = INITIAL_JPEG_QUALITY;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new MedicinePhotoError("この端末では画像を圧縮できません。");
  }

  let blob: Blob;
  for (;;) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToJpeg(canvas, quality);

    if (blob.size <= TARGET_IMAGE_BYTES || (quality <= MIN_JPEG_QUALITY && Math.max(width, height) <= 800)) {
      return blob;
    }

    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.1);
    } else {
      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }
  }
};
