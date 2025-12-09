// Utility functions for managing product tags in local storage

export interface ProductTag {
  productId: string;
  note: string;
  createdAt: string;
}

export interface ProductNote {
  note: string;
  productId?: string;
  createdAt: string;
}

const TAGS_STORAGE_KEY = 'product_tags';
const NOTES_STORAGE_KEY = 'product_notes';

// Get all tags for a specific product
export function getProductTags(productId: string): ProductTag[] {
  try {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY);
    if (!stored) return [];
    const allTags: ProductTag[] = JSON.parse(stored);
    return allTags.filter(tag => tag.productId === productId);
  } catch (error) {
    console.error('Error reading product tags:', error);
    return [];
  }
}

// Save a tag for a product
export function saveProductTag(productId: string, note: string): void {
  try {
    const stored = localStorage.getItem(TAGS_STORAGE_KEY);
    const allTags: ProductTag[] = stored ? JSON.parse(stored) : [];
    
    // Add new tag
    const newTag: ProductTag = {
      productId,
      note: note.trim(),
      createdAt: new Date().toISOString()
    };
    
    allTags.push(newTag);
    
    // Keep only the most recent tags (limit to last 100 per product to avoid storage bloat)
    const productTags = allTags.filter(tag => tag.productId === productId);
    if (productTags.length > 100) {
      const sorted = productTags.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const toKeep = sorted.slice(0, 100);
      const otherTags = allTags.filter(tag => tag.productId !== productId);
      localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify([...otherTags, ...toKeep]));
    } else {
      localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(allTags));
    }
  } catch (error) {
    console.error('Error saving product tag:', error);
  }
}

// Get all notes (for autocomplete suggestions)
export function getAllNotes(): ProductNote[] {
  try {
    const stored = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error reading product notes:', error);
    return [];
  }
}

// Save a note (for autocomplete suggestions)
export function saveNote(note: string, productId?: string): void {
  try {
    const stored = localStorage.getItem(NOTES_STORAGE_KEY);
    const allNotes: ProductNote[] = stored ? JSON.parse(stored) : [];
    
    // Add new note
    const newNote: ProductNote = {
      note: note.trim(),
      productId,
      createdAt: new Date().toISOString()
    };
    
    // Remove duplicate notes (same text)
    const filtered = allNotes.filter(n => n.note.trim().toLowerCase() !== note.trim().toLowerCase());
    filtered.push(newNote);
    
    // Keep only the most recent 50 notes
    const sorted = filtered.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const toKeep = sorted.slice(0, 50);
    
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(toKeep));
  } catch (error) {
    console.error('Error saving product note:', error);
  }
}

// Get last 3 notes for a specific product (or all products if productId is not provided)
export function getLastThreeNotes(productId?: string): string[] {
  const allNotes = getAllNotes();
  
  // Filter by product if productId is provided
  const filteredNotes = productId 
    ? allNotes.filter(note => note.productId === productId)
    : allNotes;
  
  const sorted = filteredNotes.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return sorted.slice(0, 3).map(n => n.note);
}

// Get matching notes for a product
export function getMatchingNotes(productId: string, searchTerm: string): string[] {
  const allNotes = getAllNotes();
  const searchLower = searchTerm.toLowerCase().trim();
  
  // Filter notes that match the search term and are for this specific product only
  const matching = allNotes.filter(note => {
    const matchesProduct = note.productId === productId;
    const matchesSearch = note.note.toLowerCase().includes(searchLower);
    return matchesProduct && matchesSearch;
  });
  
  // Sort by most recent and return unique notes
  const sorted = matching.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  const uniqueNotes = new Set<string>();
  const result: string[] = [];
  for (const note of sorted) {
    if (!uniqueNotes.has(note.note.toLowerCase())) {
      uniqueNotes.add(note.note.toLowerCase());
      result.push(note.note);
      if (result.length >= 10) break; // Limit to 10 suggestions
    }
  }
  
  return result;
}

