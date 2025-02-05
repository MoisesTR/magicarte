export function getImageUrl(productImage) {
    let imageUrl =
        "https://fastly.picsum.photos/id/866/500/500.jpg?hmac=FOptChXpmOmfR5SpiL2pp74Yadf1T_bRhBF1wJZa9hg";
    if (productImage) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseBucket = `${supabaseUrl}/storage/v1/object/public/images`;
        imageUrl = `${supabaseBucket}/${productImage}`;
    }

    return imageUrl;
}