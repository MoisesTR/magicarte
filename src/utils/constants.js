export const MAGIC_ARTE = 'MagicArte';

export const TABLE = {
    PRODUCT: 'products',
    CATEGORIES: 'categories'
};
export const COLUMNS = {
    [TABLE.PRODUCT]: "id, name, price, description, image_url, category_id, secondary_images",
    [TABLE.CATEGORIES]: "id, name, order"
};