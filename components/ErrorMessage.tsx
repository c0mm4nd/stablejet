interface ErrorMessageProps {
  message: string;
}

export default function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="bg-red-500 text-white p-6 rounded-xl shadow-lg my-8">
      <strong className="text-lg">错误:</strong>
      <p className="mt-2">{message}</p>
    </div>
  );
}
