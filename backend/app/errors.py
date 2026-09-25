class AppError(Exception):
    """An error with a safe, user-facing message."""

    def __init__(self, status: int, message: str, code: str = "error"):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
