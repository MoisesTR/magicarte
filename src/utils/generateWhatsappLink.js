export function generateWhatsAppLinkForProducts(products, phoneNumber) {
  const header = "Me interesan estos productos:";
  const productMessages = products.map((product) => {
    return `\nNombre: ${product.name}\nPrecio: C$${product.price}\nDescripcion: ${product.description}`;
  });

  const message = `${header}${productMessages.join("\n\n")}`;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
}
