"""
Runtime hook: install a stub torch module before ctranslate2.converters tries to import it.
ctranslate2 inference (WhisperModel) does NOT need torch — only the model-conversion
utilities do. This stub prevents the CUDA/cuDNN DLL crash in PyInstaller bundles on
machines without a full CUDA toolkit.
"""
import importlib.machinery
import sys
from types import ModuleType


class _Stub(ModuleType):
    def __getattr__(self, name):
        if name.startswith("__") and name.endswith("__"):
            raise AttributeError(name)
        m = _Stub(f"{self.__name__}.{name}")
        setattr(self, name, m)
        return m

    def __call__(self, *args, **kwargs):
        return None

    def __iter__(self):
        return iter([])

    def __bool__(self):
        return False


_torch_stub = _Stub("torch")
_torch_stub.__version__ = "stub"
_torch_stub.__file__ = __file__
_torch_stub.__spec__ = importlib.machinery.ModuleSpec("torch", loader=None)
_torch_stub.__path__ = []
_torch_stub.__package__ = "torch"

for _sub in ("nn", "nn.functional", "nn.modules", "optim", "utils",
             "utils.data", "cuda", "autograd", "jit", "onnx"):
    _m = _Stub(f"torch.{_sub}")
    _m.__spec__ = importlib.machinery.ModuleSpec(f"torch.{_sub}", loader=None)
    _m.__package__ = f"torch.{_sub.rsplit('.', 1)[0]}" if "." in _sub else "torch"
    sys.modules[f"torch.{_sub}"] = _m

sys.modules["torch"] = _torch_stub

# onnxruntime has DLL initialization issues in PyInstaller onefile bundles.
# VAD is disabled (LOCAL_AI_STT_VAD_FILTER=false) so onnxruntime is never called
# at inference time — stub it out if it fails to load.
try:
    import onnxruntime  # noqa: F401
except (ImportError, OSError, Exception):
    _ort = _Stub("onnxruntime")
    _ort.__spec__ = importlib.machinery.ModuleSpec("onnxruntime", loader=None)
    _ort.__path__ = []
    _ort.__package__ = "onnxruntime"
    _ort.__version__ = "stub"
    for _sub in ("capi", "capi._pybind_state", "capi.onnxruntime_pybind11_state",
                 "tools", "backend", "quantization", "transformers"):
        _m2 = _Stub(f"onnxruntime.{_sub}")
        _m2.__spec__ = importlib.machinery.ModuleSpec(f"onnxruntime.{_sub}", loader=None)
        sys.modules[f"onnxruntime.{_sub}"] = _m2
    sys.modules["onnxruntime"] = _ort
