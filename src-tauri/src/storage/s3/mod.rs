pub(crate) mod copy;
pub(crate) mod objects;
pub(crate) mod transfer;

pub(crate) fn format_storage_error(error: &impl std::fmt::Display) -> String {
    format!("对象存储请求失败：{error}")
}
