#include <iomanip>
#include <iostream>

int main() {
    std::cout << "Hello from C++!\n";
    std::cout << "37 gift packs x $19.90 = $"
              << std::fixed << std::setprecision(2) << 37 * 19.90 << '\n';
    return 0;
}
