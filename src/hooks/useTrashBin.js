import { useState, useEffect } from 'react';
import { 
  subscribeToTrashBin, 
  restoreFromTrash, 
  permanentlyDeleteFromTrash, 
  emptyTrashBin 
} from '../services/trashBinService';

export function useTrashBin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToTrashBin((data) => {
      setItems(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const restoreItem = async (item, mode = 'original', userEmail) => {
    return await restoreFromTrash(item, mode, userEmail);
  };

  const deleteItemPermanently = async (trashId) => {
    return await permanentlyDeleteFromTrash(trashId);
  };

  const clearAll = async () => {
    return await emptyTrashBin();
  };

  return {
    items,
    loading,
    count: items.length,
    restoreItem,
    deleteItemPermanently,
    clearAll
  };
}
