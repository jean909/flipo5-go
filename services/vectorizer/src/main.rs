use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Query},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::net::SocketAddr;
use tower_http::limit::RequestBodyLimitLayer;
use visioncortex::ColorImage;
use vtracer::{convert, Config};

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024; // 20 MB

async fn health() -> &'static str {
    "ok"
}

#[derive(Debug, Deserialize, Default)]
struct ConvertParams {
    /// "color" (default) or "binary"
    mode: Option<String>,
    /// path simplify: "none" | "polygon" | "spline" (default)
    path: Option<String>,
}

fn apply_mode(mut cfg: Config, params: &ConvertParams) -> Config {
    if matches!(params.mode.as_deref(), Some("binary") | Some("bw") | Some("mono")) {
        cfg.color_mode = vtracer::ColorMode::Binary;
    }
    match params.path.as_deref() {
        Some("none") => cfg.mode = visioncortex::PathSimplifyMode::None,
        Some("polygon") => cfg.mode = visioncortex::PathSimplifyMode::Polygon,
        Some("spline") | _ => cfg.mode = visioncortex::PathSimplifyMode::Spline,
    }
    cfg
}

async fn convert_handler(
    Query(params): Query<ConvertParams>,
    body: Bytes,
) -> impl IntoResponse {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, "empty body").into_response();
    }
    if body.len() > MAX_IMAGE_BYTES {
        return (StatusCode::PAYLOAD_TOO_LARGE, "image too large").into_response();
    }

    let img = match image::load_from_memory(&body) {
        Ok(i) => i.to_rgba8(),
        Err(err) => {
            tracing::warn!(?err, "invalid image");
            return (StatusCode::BAD_REQUEST, format!("invalid image: {err}")).into_response();
        }
    };

    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return (StatusCode::BAD_REQUEST, "empty image").into_response();
    }

    let color_image = ColorImage {
        pixels: img.into_raw(),
        width: width as usize,
        height: height as usize,
    };

    let cfg = apply_mode(Config::default(), &params);

    let svg = match convert(color_image, cfg) {
        Ok(s) => s,
        Err(err) => {
            tracing::error!(?err, "vectorize failed");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("vectorize failed: {err}"),
            )
                .into_response();
        }
    };

    let svg_text = format!("{svg}");

    (
        [(header::CONTENT_TYPE, "image/svg+xml")],
        svg_text,
    )
        .into_response()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8081);

    let app = Router::new()
        .route("/health", get(health))
        .route("/convert", post(convert_handler))
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_IMAGE_BYTES));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    tracing::info!("vectorizer listening on {addr}");
    axum::serve(listener, app).await.expect("serve");
}
