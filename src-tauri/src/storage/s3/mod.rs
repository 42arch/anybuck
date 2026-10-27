pub(crate) mod compatibility;
pub(crate) mod copy;
pub(crate) mod migrate;
mod multipart;
pub(crate) mod objects;
pub(crate) mod transfer;

pub(crate) fn format_storage_error(error: &impl std::error::Error) -> String {
    let summary = error.to_string();
    let mut message = summary.clone();
    let mut previous = summary;
    let mut source = error.source();
    while let Some(cause) = source {
        let detail = cause.to_string();
        if !detail.is_empty() && detail != previous {
            message.push_str(" | ");
            message.push_str(&detail);
        }
        previous = detail;
        source = cause.source();
    }
    message
}

#[cfg(test)]
mod tests {
    use super::format_storage_error;
    use std::{error::Error, fmt};

    #[derive(Debug)]
    struct DispatchFailure(std::io::Error);

    impl fmt::Display for DispatchFailure {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "dispatch failure")
        }
    }

    impl Error for DispatchFailure {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            Some(&self.0)
        }
    }

    #[test]
    fn storage_error_includes_underlying_transport_failure() {
        let dispatch = DispatchFailure(std::io::Error::other("DNS lookup failed"));
        let message = format_storage_error(&dispatch);
        assert_eq!(message, "dispatch failure | DNS lookup failed");
    }
}
