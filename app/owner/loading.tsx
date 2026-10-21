// Thin progress bar while these pages load. It is not at the app root, so the
// public /designs pages are not wrapped in a loading boundary and can answer
// with real 404/500 status codes.
export { default } from "@/components/loading/root-loading"
