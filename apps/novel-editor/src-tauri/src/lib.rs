use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, Window};
use tauri_plugin_opener::OpenerExt;
use tempfile::NamedTempFile;

const CODEX_LINE_EVENT: &str = "codex://line";
const CODEX_EXIT_EVENT: &str = "codex://exit";
const BEFORE_CLOSE_EVENT: &str = "app://before-close";

#[derive(Default)]
struct CodexRuntime {
    generation: u64,
    stdin: Option<std::process::ChildStdin>,
    child: Option<Arc<Mutex<Child>>>,
}

struct AppState {
    data_dir: PathBuf,
    allowed_roots: Mutex<HashSet<PathBuf>>,
    allowed_files: Mutex<HashSet<PathBuf>>,
    close_approved: AtomicBool,
    codex: Mutex<CodexRuntime>,
    http: reqwest::Client,
    memory_credentials: Mutex<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppPaths {
    data_dir: String,
    documents_dir: String,
    cache_dir: String,
    temp_dir: String,
    home_dir: String,
    platform: String,
    version: String,
    app_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: String,
    version: String,
    platform: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileText {
    path: String,
    name: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    status: u16,
    body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexInfo {
    installed: bool,
    running: bool,
    path: Option<String>,
    generation: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitHubStatus {
    cli_installed: bool,
    connected: bool,
    state: String,
    message: String,
}

/// Windows canonical paths carry a `\\?\` prefix. The renderer's path helpers rebuild them as
/// `\\?\C:/…`, which `canonicalize` rejects with os error 123, and their drive detection turns
/// `\\?\D:\…` into `/?/D:/…`, which then fails the managed-path boundary check. Strip the prefix
/// before a path crosses the IPC boundary and before comparing managed roots.
fn simplify_path(path: &Path) -> PathBuf {
    if !cfg!(windows) {
        return path.to_path_buf();
    }
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!("\\\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    if let Some(rest) = text.strip_prefix("//?/UNC/") {
        return PathBuf::from(format!("\\\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix("//?/") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

fn path_key(path: &Path) -> String {
    let simplified = simplify_path(path);
    let text = simplified.to_string_lossy().replace('\\', "/");
    let trimmed = text.trim_end_matches('/').to_owned();
    if cfg!(windows) {
        trimmed.to_lowercase()
    } else {
        trimmed
    }
}

fn path_is_inside(root: &Path, candidate: &Path) -> bool {
    let root = path_key(root);
    let candidate = path_key(candidate);
    candidate == root || candidate.starts_with(&(format!("{root}/")))
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                if !result.pop() {
                    result.push(component.as_os_str());
                }
            }
            Component::CurDir => {}
            other => result.push(other.as_os_str()),
        }
    }
    result
}

fn existing_ancestor(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        simplify_path(path)
    } else {
        std::env::current_dir()
            .map_err(|error| format!("EIO: current directory: {error}"))?
            .join(path)
    };
    let normalized = normalize_lexical(&absolute);
    if normalized.exists() {
        return fs::canonicalize(&normalized).map_err(|error| fs_error("canonicalize", error));
    }
    let mut probe = normalized.clone();
    let mut suffix: Vec<std::ffi::OsString> = Vec::new();
    while !probe.exists() {
        let Some(name) = probe.file_name().map(|value| value.to_os_string()) else {
            return Err("EINVAL: path has no existing ancestor".to_owned());
        };
        suffix.push(name);
        let Some(parent) = probe.parent() else {
            return Err("EINVAL: path has no existing ancestor".to_owned());
        };
        probe = parent.to_path_buf();
    }
    let mut result = fs::canonicalize(&probe).map_err(|error| fs_error("canonicalize", error))?;
    for part in suffix.iter().rev() {
        result.push(part);
    }
    Ok(result)
}

fn fs_error(action: &str, error: std::io::Error) -> String {
    let code = match error.kind() {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        std::io::ErrorKind::AlreadyExists => "EEXIST",
        std::io::ErrorKind::InvalidInput => "EINVAL",
        _ => "EIO",
    };
    format!("{code}: {action}: {error}")
}

fn check_allowed(state: &AppState, path: &Path) -> Result<(), String> {
    let roots = state.allowed_roots.lock().map_err(|_| "EIO: roots lock")?;
    if roots.iter().any(|root| path_is_inside(root, path)) {
        return Ok(());
    }
    drop(roots);
    let files = state.allowed_files.lock().map_err(|_| "EIO: files lock")?;
    if files.iter().any(|file| path_key(file) == path_key(path)) {
        return Ok(());
    }
    #[cfg(debug_assertions)]
    {
        let roots = state.allowed_roots.lock().map(|roots| roots.iter().cloned().collect::<Vec<_>>()).unwrap_or_default();
        eprintln!("[kohon][denied] path={path:?} key={:?} roots={roots:?}", path_key(path));
    }
    Err("EACCES: managed path boundary violation".to_owned())
}

fn resolve_read(state: &AppState, path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(simplify_path(Path::new(path))).map_err(|error| fs_error("read", error))?;
    check_allowed(state, &canonical)?;
    Ok(canonical)
}

fn resolve_write(state: &AppState, path: &str) -> Result<PathBuf, String> {
    let normalized = existing_ancestor(Path::new(path))?;
    check_allowed(state, &normalized)?;
    Ok(normalized)
}

fn add_root(state: &AppState, path: PathBuf) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(simplify_path(&path)).map_err(|error| fs_error("canonicalize", error))?;
    if !canonical.is_dir() {
        return Err("EINVAL: project root must be a directory".to_owned());
    }
    state
        .allowed_roots
        .lock()
        .map_err(|_| "EIO: roots lock")?
        .insert(canonical.clone());
    Ok(simplify_path(&canonical))
}

fn http_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    match url.host_str().unwrap_or_default() {
        "api.openai.com" => url.path().starts_with("/v1/"),
        "api.github.com" => url.path() == "/repos/Hum1Tab/kohon/releases/latest",
        _ => false,
    }
}

fn external_url_allowed(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or_default();
    if host == "chatgpt.com" || host.ends_with(".chatgpt.com") {
        return true;
    }
    if host == "openai.com" || host.ends_with(".openai.com") {
        return true;
    }
    if host == "cli.github.com" {
        return true;
    }
    if host == "github.com" {
        return url.path().starts_with("/Hum1Tab/kohon/releases/")
            || url.path() == "/settings/applications";
    }
    false
}

fn locate_gh() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("KOHON_GH_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let executable = if cfg!(windows) { "gh.exe" } else { "gh" };
    if let Some(path) = std::env::var_os("PATH") {
        for folder in std::env::split_paths(&path) {
            let candidate = folder.join(executable);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(windows) {
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            candidates.push(PathBuf::from(program_files).join("GitHub CLI").join("gh.exe"));
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local_app_data).join("Programs").join("GitHub CLI").join("gh.exe"));
        }
    } else {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/gh"),
            PathBuf::from("/usr/local/bin/gh"),
            PathBuf::from("/usr/bin/gh"),
            PathBuf::from("/home/linuxbrew/.linuxbrew/bin/gh"),
        ]);
    }
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn codex_executable(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("KOHON_CODEX_PATH") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    let name = if cfg!(windows) { "codex.exe" } else { "codex" };
    let current = std::env::current_exe().ok()?;
    if let Some(parent) = current.parent() {
        let candidate = parent.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    if let Some(parent) = current.parent() {
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let candidate = entry.path();
                let file_name = candidate.file_name().map(|value| value.to_string_lossy().into_owned()).unwrap_or_default();
                let matches_triple = file_name.starts_with("codex-")
                    && if cfg!(windows) { file_name.ends_with(".exe") } else { true };
                if matches_triple && candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    let triple = option_env!("TARGET").unwrap_or_default();
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        manifest.join("binaries").join(format!("codex-{triple}{}", if cfg!(windows) { ".exe" } else { "" })),
        manifest.join("binaries").join(name),
    ];
    if let Some(candidate) = candidates.into_iter().find(|candidate| candidate.is_file()) {
        return Some(candidate);
    }
    let resource = app.path().resource_dir().ok()?.join(name);
    resource.is_file().then_some(resource)
}

fn platform_name() -> String {
    if cfg!(windows) {
        "win32".to_owned()
    } else if cfg!(target_os = "macos") {
        "darwin".to_owned()
    } else {
        "linux".to_owned()
    }
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        name: "KOHON".to_owned(),
        version: app.package_info().version.to_string(),
        platform: platform_name(),
    }
}

#[tauri::command]
fn app_paths(app: AppHandle, state: State<'_, AppState>) -> Result<AppPaths, String> {
    let path = app.path();
    let data_dir = state.data_dir.clone();
    let documents = path.document_dir().map_err(|error| error.to_string())?;
    let cache = path.cache_dir().map_err(|error| error.to_string())?.join("KOHON");
    let temp = path.temp_dir().map_err(|error| error.to_string())?.join("KOHON");
    let home = path.home_dir().map_err(|error| error.to_string())?;
    for directory in [&data_dir, &cache, &temp] {
        fs::create_dir_all(directory).map_err(|error| fs_error("create app directory", error))?;
    }
    Ok(AppPaths {
        data_dir: data_dir.to_string_lossy().into_owned(),
        documents_dir: documents.to_string_lossy().into_owned(),
        cache_dir: cache.to_string_lossy().into_owned(),
        temp_dir: temp.to_string_lossy().into_owned(),
        home_dir: home.to_string_lossy().into_owned(),
        platform: platform_name(),
        version: app.package_info().version.to_string(),
        app_name: "KOHON".to_owned(),
    })
}

#[tauri::command]
fn project_add_root(state: State<'_, AppState>, path: String) -> Result<String, String> {
    add_root(&state, PathBuf::from(path)).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn project_create_root(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target = existing_ancestor(Path::new(&path))?;
    if target.exists() && !target.is_dir() {
        return Err("EINVAL: project root exists and is not a directory".to_owned());
    }
    fs::create_dir_all(&target).map_err(|error| fs_error("create project root", error))?;
    add_root(&state, target).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn external_allow_root(state: State<'_, AppState>, path: String, create: Option<bool>) -> Result<String, String> {
    let target = existing_ancestor(Path::new(&path))?;
    if create.unwrap_or(false) {
        fs::create_dir_all(&target).map_err(|error| fs_error("create folder", error))?;
    }
    let canonical = if target.exists() {
        simplify_path(&fs::canonicalize(&target).map_err(|error| fs_error("canonicalize", error))?)
    } else {
        target
    };
    state
        .allowed_roots
        .lock()
        .map_err(|_| "EIO: roots lock")?
        .insert(canonical.clone());
    Ok(canonical.to_string_lossy().into_owned())
}

#[tauri::command]
fn external_allow_target(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target = existing_ancestor(Path::new(&path))?;
    state
        .allowed_files
        .lock()
        .map_err(|_| "EIO: files lock")?
        .insert(target.clone());
    Ok(simplify_path(&target).to_string_lossy().into_owned())
}

#[tauri::command]
fn fs_read_text(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target = resolve_read(&state, &path)?;
    fs::read_to_string(target).map_err(|error| fs_error("read text", error))
}

#[tauri::command]
fn fs_write_text(state: State<'_, AppState>, path: String, text: String) -> Result<(), String> {
    let target = resolve_write(&state, &path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| fs_error("create parent directory", error))?;
    }
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&target).map_err(|error| fs_error("write text", error))?;
    file.write_all(text.as_bytes()).map_err(|error| fs_error("write text", error))
}

#[tauri::command]
fn fs_write_text_atomic(state: State<'_, AppState>, path: String, text: String) -> Result<(), String> {
    let target = resolve_write(&state, &path)?;
    let parent = target
        .parent()
        .ok_or_else(|| "EINVAL: target has no parent directory".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| fs_error("create parent directory", error))?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| fs_error("create temporary file", error))?;
    temporary
        .write_all(text.as_bytes())
        .map_err(|error| fs_error("write temporary file", error))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| fs_error("sync temporary file", error))?;
    temporary
        .persist(&target)
        .map_err(|error| fs_error("replace text file", error.error))?;
    Ok(())
}

#[tauri::command]
fn fs_mkdir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let target = resolve_write(&state, &path)?;
    fs::create_dir_all(target).map_err(|error| fs_error("create directory", error))
}

#[tauri::command]
fn fs_read_dir(state: State<'_, AppState>, path: String) -> Result<Vec<String>, String> {
    let target = resolve_read(&state, &path)?;
    let mut names = Vec::new();
    for entry in fs::read_dir(target).map_err(|error| fs_error("read directory", error))? {
        let entry = entry.map_err(|error| fs_error("read directory", error))?;
        names.push(entry.file_name().to_string_lossy().into_owned());
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
fn fs_remove(
    state: State<'_, AppState>,
    path: String,
    recursive: Option<bool>,
    force: Option<bool>,
) -> Result<(), String> {
    let requested = PathBuf::from(&path);
    if !requested.exists() {
        return if force.unwrap_or(true) {
            Ok(())
        } else {
            Err("ENOENT: remove: path does not exist".to_owned())
        };
    }
    let target = resolve_read(&state, &path)?;
    let metadata = fs::symlink_metadata(&target).map_err(|error| fs_error("inspect", error))?;
    if metadata.is_dir() {
        if recursive.unwrap_or(false) {
            fs::remove_dir_all(target).map_err(|error| fs_error("remove directory", error))
        } else {
            fs::remove_dir(target).map_err(|error| fs_error("remove directory", error))
        }
    } else {
        fs::remove_file(target).map_err(|error| fs_error("remove file", error))
    }
}

#[tauri::command]
fn fs_exists(state: State<'_, AppState>, path: String) -> Result<bool, String> {
    let requested = PathBuf::from(&path);
    if !requested.exists() {
        return Ok(false);
    }
    let target = resolve_read(&state, &path)?;
    Ok(target.exists())
}

#[tauri::command]
fn fs_realpath(state: State<'_, AppState>, path: String) -> Result<String, String> {
    resolve_read(&state, &path).map(|path| simplify_path(&path).to_string_lossy().into_owned())
}

fn copy_tree(source: &Path, destination: &Path, exclude_root_names: &HashSet<String>, at_root: bool) -> Result<(), String> {
    if at_root {
        if destination.exists() {
            return Err("EEXIST: destination already exists".to_owned());
        }
        fs::create_dir_all(destination).map_err(|error| fs_error("create destination", error))?;
    }
    for entry in fs::read_dir(source).map_err(|error| fs_error("read directory", error))? {
        let entry = entry.map_err(|error| fs_error("read directory", error))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if at_root && exclude_root_names.contains(&name) {
            continue;
        }
        let source_path = entry.path();
        let target_path = destination.join(&name);
        let file_type = entry.file_type().map_err(|error| fs_error("inspect", error))?;
        if file_type.is_symlink() {
            return Err(format!("EACCES: refusing to copy symbolic link {name}"));
        }
        if file_type.is_dir() {
            fs::create_dir_all(&target_path).map_err(|error| fs_error("create directory", error))?;
            copy_tree(&source_path, &target_path, exclude_root_names, false)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| fs_error("copy file", error))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn fs_copy_tree(
    state: State<'_, AppState>,
    source: String,
    destination: String,
    exclude_root_names: Option<Vec<String>>,
) -> Result<(), String> {
    let source = resolve_read(&state, &source)?;
    if !source.is_dir() {
        return Err("EINVAL: copy source is not a directory".to_owned());
    }
    let destination = resolve_write(&state, &destination)?;
    if destination.exists() {
        return Err("EEXIST: destination already exists".to_owned());
    }
    let excluded: HashSet<String> = exclude_root_names.unwrap_or_default().into_iter().collect();
    copy_tree(&source, &destination, &excluded, true)
}

#[tauri::command]
fn read_external_text_files(paths: Vec<String>) -> Result<Vec<FileText>, String> {
    if paths.len() > 100 {
        return Err("EINVAL: too many files".to_owned());
    }
    let mut total = 0_u64;
    let mut result = Vec::new();
    for path in paths {
        let canonical = fs::canonicalize(simplify_path(Path::new(&path)))
            .map_err(|error| fs_error("read external file", error))?;
        let metadata = fs::metadata(&canonical).map_err(|error| fs_error("inspect external file", error))?;
        if !metadata.is_file() {
            return Err("EINVAL: selected path is not a file".to_owned());
        }
        total = total.saturating_add(metadata.len());
        if total > 50_000_000 {
            return Err("EINVAL: selected files exceed 50 MB".to_owned());
        }
        let text = fs::read_to_string(&canonical).map_err(|error| fs_error("read external file", error))?;
        let name = canonical
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        result.push(FileText {
            path: simplify_path(&canonical).to_string_lossy().into_owned(),
            name,
            text,
        });
    }
    Ok(result)
}

#[tauri::command]
async fn http_request(
    state: State<'_, AppState>,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpResponse, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| format!("EINVAL: invalid URL: {error}"))?;
    if !http_allowed(&parsed) {
        return Err("EACCES: HTTP destination is not allowed".to_owned());
    }
    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|error| format!("EINVAL: invalid method: {error}"))?;
    let mut request = state
        .http
        .request(method, parsed)
        .timeout(Duration::from_millis(timeout_ms.unwrap_or(30_000).clamp(1_000, 120_000)));
    for (name, value) in headers.unwrap_or_default() {
        let lower = name.to_lowercase();
        if !matches!(
            lower.as_str(),
            "authorization" | "content-type" | "accept" | "x-client-request-id" | "user-agent"
        ) {
            continue;
        }
        request = request.header(name, value);
    }
    if let Some(body) = body {
        if body.len() > 2_000_000 {
            return Err("EINVAL: HTTP body is too large".to_owned());
        }
        request = request.body(body);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("EIO: HTTP request failed: {error}"))?;
    let status = response.status().as_u16();
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("EIO: HTTP response failed: {error}"))?;
    if bytes.len() > 8_000_000 {
        return Err("EIO: HTTP response is too large".to_owned());
    }
    let body = String::from_utf8(bytes.to_vec()).map_err(|_| "EIO: HTTP response is not UTF-8".to_owned())?;
    Ok(HttpResponse { status, body })
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|error| format!("EINVAL: invalid URL: {error}"))?;
    if !external_url_allowed(&parsed) {
        return Err("EACCES: external URL is not allowed".to_owned());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| format!("EIO: cannot open URL: {error}"))
}

#[tauri::command]
fn credential_available() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn keyring_entry(service: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("io.github.hum1tab.kohon", service).map_err(|error| format!("EIO: keyring: {error}"))
}

#[tauri::command]
fn credential_get(state: State<'_, AppState>, service: String) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        match keyring_entry(&service)?.get_password() {
            Ok(value) => return Ok(Some(value)),
            Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("EIO: keyring: {error}")),
        }
    }
    let memory = state.memory_credentials.lock().map_err(|_| "EIO: credential lock")?;
    Ok(memory.get(&service).cloned())
}

#[tauri::command]
fn credential_set(state: State<'_, AppState>, service: String, value: String) -> Result<(), String> {
    if value.len() > 20_000 {
        return Err("EINVAL: credential is too long".to_owned());
    }
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        keyring_entry(&service)?
            .set_password(&value)
            .map_err(|error| format!("EIO: keyring: {error}"))?;
    }
    state
        .memory_credentials
        .lock()
        .map_err(|_| "EIO: credential lock")?
        .insert(service, value);
    Ok(())
}

#[tauri::command]
fn credential_delete(state: State<'_, AppState>, service: String) -> Result<(), String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        match keyring_entry(&service)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("EIO: keyring: {error}")),
        }
    }
    state
        .memory_credentials
        .lock()
        .map_err(|_| "EIO: credential lock")?
        .remove(&service);
    Ok(())
}

#[tauri::command]
fn gh_status() -> GitHubStatus {
    let Some(executable) = locate_gh() else {
        return GitHubStatus {
            cli_installed: false,
            connected: false,
            state: "unavailable".to_owned(),
            message: "GitHub CLIが見つかりません。".to_owned(),
        };
    };
    let result = Command::new(executable)
        .args(["auth", "status", "--active", "--hostname", "github.com"])
        .env("GH_PAGER", "cat")
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .output();
    match result {
        Ok(output) if output.status.success() => GitHubStatus {
            cli_installed: true,
            connected: true,
            state: "connected".to_owned(),
            message: "利用者のGitHub CLI認証へ接続済みです。KOHONはtokenを読みません。".to_owned(),
        },
        Ok(_) => GitHubStatus {
            cli_installed: true,
            connected: false,
            state: "disconnected".to_owned(),
            message: "GitHub CLIはinstall済みですが、github.comへ未ログインです。".to_owned(),
        },
        Err(error) => GitHubStatus {
            cli_installed: true,
            connected: false,
            state: "error".to_owned(),
            message: format!("GitHub CLIの認証状態を確認できません。{error}"),
        },
    }
}

#[tauri::command]
async fn gh_login() -> Result<GitHubStatus, String> {
    let Some(executable) = locate_gh() else {
        return Err("GitHub CLIが見つかりません。先に公式GitHub CLIをinstallしてください。".to_owned());
    };
    let result = tauri::async_runtime::spawn_blocking(move || {
        Command::new(executable)
            .args([
                "auth",
                "login",
                "--web",
                "--clipboard",
                "--hostname",
                "github.com",
                "--git-protocol",
                "https",
                "--skip-ssh-key",
            ])
            .env("GH_PAGER", "cat")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .output()
    })
    .await
    .map_err(|error| format!("EIO: GitHub login task: {error}"))?
    .map_err(|error| format!("EIO: GitHub login: {error}"))?;
    if !result.status.success() {
        return Err("GitHubログインを完了できませんでした。".to_owned());
    }
    Ok(gh_status())
}

fn emit_codex_line(app: &AppHandle, generation: u64, line: String) {
    let _ = app.emit(CODEX_LINE_EVENT, json!({ "generation": generation, "line": line }));
}

#[tauri::command]
fn codex_start(app: AppHandle, state: State<'_, AppState>, client_version: String, cwd: Option<String>) -> Result<CodexInfo, String> {
    let executable = codex_executable(&app);
    let Some(executable) = executable else {
        return Err("Codex実行環境が見つかりません。KOHONを再インストールしてください。".to_owned());
    };
    let mut runtime = state.codex.lock().map_err(|_| "EIO: Codex lock")?;
    if let Some(child) = runtime.child.as_ref() {
        if child.lock().map(|mut child| child.try_wait().ok().flatten().is_none()).unwrap_or(false) {
            return Ok(CodexInfo {
                installed: true,
                running: true,
                path: Some(executable.to_string_lossy().into_owned()),
                generation: runtime.generation,
            });
        }
    }
    if let Some(child) = runtime.child.take() {
        if let Ok(mut child) = child.lock() {
            let _ = child.kill();
        }
    }
    runtime.stdin = None;
    runtime.generation += 1;
    let generation = runtime.generation;
    let working_directory = cwd
        .map(PathBuf::from)
        .unwrap_or_else(|| state.data_dir.join("codex-scratch"));
    fs::create_dir_all(&working_directory).map_err(|error| fs_error("create Codex working directory", error))?;
    let mut command = Command::new(&executable);
    command
        .arg("app-server")
        .current_dir(&working_directory)
        .env("NO_COLOR", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let mut child = command.spawn().map_err(|error| format!("EIO: Codex start failed: {error}"))?;
    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    runtime.stdin = stdin;
    runtime.child = Some(child.clone());
    let client_name = format!("{client_version}");
    let app_for_stdout = app.clone();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => emit_codex_line(&app_for_stdout, generation, line),
                    Err(_) => break,
                }
            }
        });
    }
    let app_for_stderr = app.clone();
    if let Some(stderr) = stderr {
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                if let Ok(line) = line {
                    let _ = app_for_stderr.emit("codex://stderr", json!({ "generation": generation, "line": line }));
                }
            }
        });
    }
    let app_for_exit = app.clone();
    let child_for_exit = child.clone();
    thread::spawn(move || {
        loop {
            let status = child_for_exit.lock().ok().and_then(|mut child| child.try_wait().ok().flatten());
            if let Some(status) = status {
                let _ = app_for_exit.emit(
                    CODEX_EXIT_EVENT,
                    json!({
                        "generation": generation,
                        "code": status.code(),
                        "success": status.success(),
                        "client": client_name
                    }),
                );
                break;
            }
            thread::sleep(Duration::from_millis(80));
        }
    });
    Ok(CodexInfo {
        installed: true,
        running: true,
        path: Some(executable.to_string_lossy().into_owned()),
        generation,
    })
}

#[tauri::command]
fn codex_write(state: State<'_, AppState>, line: String) -> Result<(), String> {
    if line.len() > 8_000_000 {
        return Err("EINVAL: Codex message is too large".to_owned());
    }
    let mut runtime = state.codex.lock().map_err(|_| "EIO: Codex lock")?;
    let stdin = runtime.stdin.as_mut().ok_or_else(|| "ENOENT: Codex is not running".to_owned())?;
    stdin
        .write_all(line.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|error| format!("EIO: Codex write failed: {error}"))
}

#[tauri::command]
fn codex_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut runtime = state.codex.lock().map_err(|_| "EIO: Codex lock")?;
    runtime.generation += 1;
    runtime.stdin = None;
    if let Some(child) = runtime.child.take() {
        if let Ok(mut child) = child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    Ok(())
}

#[tauri::command]
fn codex_status(app: AppHandle, state: State<'_, AppState>) -> CodexInfo {
    let (running, generation) = {
        let mut runtime = match state.codex.lock() {
            Ok(runtime) => runtime,
            Err(_) => {
                return CodexInfo {
                    installed: codex_executable(&app).is_some(),
                    running: false,
                    path: None,
                    generation: 0,
                };
            }
        };
        let running = match runtime.child.as_ref() {
            Some(child) => match child.lock() {
                Ok(mut child) => matches!(child.try_wait(), Ok(None)),
                Err(_) => false,
            },
            None => false,
        };
        if !running {
            runtime.child = None;
            runtime.stdin = None;
        }
        (running, runtime.generation)
    };
    CodexInfo {
        installed: codex_executable(&app).is_some(),
        running,
        path: codex_executable(&app).map(|path| path.to_string_lossy().into_owned()),
        generation,
    }
}

#[tauri::command]
fn app_close_ready(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    state.close_approved.store(true, Ordering::SeqCst);
    let runtime = state.codex.lock().ok();
    if let Some(mut runtime) = runtime {
        runtime.stdin = None;
        if let Some(child) = runtime.child.take() {
            if let Ok(mut child) = child.lock() {
                let _ = child.kill();
            }
        }
    }
    window.close().map_err(|error| format!("EIO: close window: {error}"))
}

fn migrate_legacy_data(data_dir: &Path) {
    let Some(app_data) = data_dir.parent() else {
        return;
    };
    for legacy in ["Novel Lens", "novel-lens"] {
        let source = app_data.join(legacy);
        for file in ["settings.json", "recent-projects.json"] {
            let from = source.join(file);
            let to = data_dir.join(file);
            if from.is_file() && !to.exists() {
                if let Some(parent) = to.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::copy(from, to);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .data_dir()
                .map_err(|error| format!("cannot resolve app data directory: {error}"))?
                .join("KOHON");
            fs::create_dir_all(&data_dir)?;
            migrate_legacy_data(&data_dir);
            let cache = app.path().cache_dir().map(|path| path.join("KOHON"));
            if let Ok(cache) = cache {
                let _ = fs::create_dir_all(cache);
            }
            let client = reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .user_agent(format!("KOHON/{}", app.package_info().version))
                .build()?;
            let mut roots = HashSet::new();
            roots.insert(fs::canonicalize(&data_dir)?);
            app.manage(AppState {
                data_dir,
                allowed_roots: Mutex::new(roots),
                allowed_files: Mutex::new(HashSet::new()),
                close_approved: AtomicBool::new(false),
                codex: Mutex::new(CodexRuntime::default()),
                http: client,
                memory_credentials: Mutex::new(HashMap::new()),
            });
            if let Some(main) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let state = app_handle.state::<AppState>();
                        if !state.close_approved.load(Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = app_handle.emit_to("main", BEFORE_CLOSE_EVENT, ());
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            app_paths,
            project_add_root,
            project_create_root,
            external_allow_root,
            external_allow_target,
            fs_read_text,
            fs_write_text,
            fs_write_text_atomic,
            fs_mkdir,
            fs_read_dir,
            fs_remove,
            fs_exists,
            fs_realpath,
            fs_copy_tree,
            read_external_text_files,
            http_request,
            open_external,
            credential_available,
            credential_get,
            credential_set,
            credential_delete,
            gh_status,
            gh_login,
            codex_start,
            codex_write,
            codex_stop,
            codex_status,
            app_close_ready
        ])
        .run(tauri::generate_context!())
        .expect("error while running KOHON");
}
